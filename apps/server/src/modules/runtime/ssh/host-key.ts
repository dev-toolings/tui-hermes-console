import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { appendFile, chmod, mkdir } from "node:fs/promises";
import path from "node:path";
import type { RuntimeSshHostKeyDto } from "@console/core/types/api";
import { HermesRuntimeError } from "../hermes-adapter";
import {
  configuredKnownHostsPath,
  entriesForHost,
  hostLookupKey,
  loadKnownHosts,
} from "./known-hosts";

export async function scanSshHostKey(
  host: string,
  port = 22,
): Promise<RuntimeSshHostKeyDto> {
  const output = await runKeyscan(host, port);
  const candidates = output
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.trim().split(/\s+/))
    .filter((fields) => fields.length >= 3 && fields[1]?.startsWith("ssh-"))
    .map((fields) => ({ keyType: fields[1]!, keyBase64: fields[2]! }));
  const selected =
    candidates.find(({ keyType }) => keyType === "ssh-ed25519") ?? candidates[0];
  if (!selected) {
    throw new HermesRuntimeError(
      "Aucune clé d’hôte SSH n’a été reçue de cette cible.",
      502,
      "SSH_HOST_KEY_SCAN_FAILED",
    );
  }
  return {
    host,
    port,
    lookup: hostLookupKey(host, port),
    ...selected,
    fingerprintSha256: fingerprint(selected.keyBase64),
  };
}

let acceptanceQueue: Promise<void> = Promise.resolve();

export function acceptSshHostKey(
  expected: RuntimeSshHostKeyDto,
): Promise<RuntimeSshHostKeyDto> {
  const operation = acceptanceQueue.then(() => acceptSshHostKeyLocked(expected));
  acceptanceQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

async function acceptSshHostKeyLocked(
  expected: RuntimeSshHostKeyDto,
): Promise<RuntimeSshHostKeyDto> {
  const scanned = await scanSshHostKey(expected.host, expected.port);
  if (
    scanned.keyType !== expected.keyType ||
    scanned.keyBase64 !== expected.keyBase64 ||
    scanned.fingerprintSha256 !== expected.fingerprintSha256
  ) {
    throw new HermesRuntimeError(
      "La clé d’hôte a changé depuis son affichage. Ne l’acceptez pas avant vérification.",
      409,
      "SSH_HOST_KEY_CHANGED",
    );
  }

  const knownHostsPath = configuredKnownHostsPath();
  const existing = entriesForHost(loadKnownHosts([knownHostsPath]), scanned.lookup);
  if (existing.some(({ revoked }) => revoked)) {
    throw new HermesRuntimeError(
      "La clé de cet hôte est révoquée dans known_hosts.",
      409,
      "SSH_HOST_KEY_REVOKED",
    );
  }
  if (existing.some(({ keyBase64 }) => keyBase64 !== scanned.keyBase64)) {
    throw new HermesRuntimeError(
      "Une autre clé est déjà enregistrée pour cet hôte.",
      409,
      "SSH_HOST_KEY_MISMATCH",
    );
  }
  if (!existing.some(({ keyBase64 }) => keyBase64 === scanned.keyBase64)) {
    await mkdir(path.dirname(knownHostsPath), { recursive: true, mode: 0o700 });
    await appendFile(
      knownHostsPath,
      `${scanned.lookup} ${scanned.keyType} ${scanned.keyBase64}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    await chmod(knownHostsPath, 0o600);
  }
  return scanned;
}

function fingerprint(keyBase64: string) {
  let key: Buffer;
  try {
    key = Buffer.from(keyBase64, "base64");
  } catch {
    key = Buffer.alloc(0);
  }
  if (key.length === 0) {
    throw new HermesRuntimeError(
      "La clé SSH reçue est invalide.",
      502,
      "SSH_HOST_KEY_SCAN_FAILED",
    );
  }
  return `SHA256:${createHash("sha256").update(key).digest("base64").replace(/=+$/, "")}`;
}

function runKeyscan(host: string, port: number): Promise<string> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(host)) {
    throw new HermesRuntimeError("Hôte SSH invalide.", 400, "INVALID_INPUT");
  }
  return new Promise((resolve, reject) => {
    const child = spawn("ssh-keyscan", ["-T", "5", "-p", String(port), host], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = (stdout + chunk.toString()).slice(-64_000);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-8_000);
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      reject(
        new HermesRuntimeError(
          error.code === "ENOENT"
            ? "ssh-keyscan est absent du serveur de la Console."
            : error.message,
          503,
          "SSH_HOST_KEY_SCAN_UNAVAILABLE",
        ),
      );
    });
    child.on("close", (code) => {
      if (code === 0 && stdout.trim()) resolve(stdout);
      else
        reject(
          new HermesRuntimeError(
            stderr.trim() || "La cible SSH n’a renvoyé aucune clé d’hôte.",
            502,
            "SSH_HOST_KEY_SCAN_FAILED",
          ),
        );
    });
  });
}
