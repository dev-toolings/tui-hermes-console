import { access, constants, lstat } from "node:fs/promises";
import path from "node:path";
import type {
  RuntimeDirectWorkspaceDiscoveryDto,
  RuntimeWorkspaceDiscoveryDto,
} from "@console/core/types/api";
import { getSharedWorkdirRoot } from "@/modules/artifacts/paths";
import { getRuntimePublic } from "./config";
import { HermesRuntimeError } from "./hermes-adapter";
import { runHermesCommand } from "./local-management";
import { discoverSshWorkspace } from "./ssh/workspace";

type DirectRuntimeTarget = {
  baseUrl: string | null;
  configRevision: number | null;
};

type TerminalCwdInspector = () => Promise<string | null>;

export async function discoverRuntimeWorkspace(
  expectedRevision?: number,
): Promise<RuntimeWorkspaceDiscoveryDto> {
  const runtime = await getRuntimePublic();
  if (!runtime.configured || !runtime.baseUrl) {
    throw new HermesRuntimeError(
      "Configurez d’abord la connexion Hermes.",
      409,
      "RUNTIME_NOT_CONFIGURED",
    );
  }
  if (runtime.transport === "ssh") {
    return {
      transport: "ssh",
      ...(await discoverSshWorkspace(expectedRevision)),
    };
  }
  if (
    expectedRevision !== undefined &&
    runtime.configRevision !== expectedRevision
  ) {
    throw new HermesRuntimeError(
      "La configuration runtime a changé. Rechargez la page.",
      409,
      "RUNTIME_CONFIGURATION_CHANGED",
    );
  }
  return discoverDirectWorkspace(runtime);
}

export async function discoverDirectWorkspace(
  runtime: DirectRuntimeTarget,
  env: Record<string, string | undefined> = process.env,
  inspectTerminalCwd: TerminalCwdInspector = inspectLocalHermesTerminalCwd,
): Promise<RuntimeDirectWorkspaceDiscoveryDto> {
  const checkedAt = new Date().toISOString();
  if (!isLoopbackUrl(runtime.baseUrl)) {
    return {
      transport: "direct",
      scope: "remote",
      configRevision: runtime.configRevision,
      proofLevel: "unavailable",
      reasonCode: "DIRECT_REMOTE_WORKSPACE_UNSUPPORTED",
      sharedWorkdir: null,
      hermesTerminalCwd: null,
      warnings: [
        "L’accès direct distant ne permet pas à la Console d’inspecter le système de fichiers Hermes.",
      ],
      blockers: [],
      restartRequired: false,
      checkedAt,
    };
  }

  const configured = env.HERMES_SHARED_WORKDIR?.trim();
  const sharedPath = getSharedWorkdirRoot(env);
  const state = await inspectLocalPath(sharedPath);
  const sharedWorkdir = {
    path: sharedPath,
    source: configured ? "env" as const : "default" as const,
    ...state,
  };
  const warnings: string[] = [];
  const blockers: string[] = [];

  if (state.symlink) {
    blockers.push("Le dossier partagé ne peut pas être un lien symbolique.");
  } else if (!state.exists) {
    blockers.push("Le dossier partagé configuré n’existe pas sur le serveur de la Console.");
  } else if (!state.readable || !state.writable) {
    blockers.push("Le serveur de la Console doit pouvoir lire et écrire dans le dossier partagé.");
  }

  if (blockers.length > 0) {
    return {
      transport: "direct",
      scope: "local",
      configRevision: runtime.configRevision,
      proofLevel: "unavailable",
      reasonCode: "DIRECT_WORKSPACE_UNAVAILABLE",
      sharedWorkdir,
      hermesTerminalCwd: null,
      warnings,
      blockers,
      restartRequired: !configured,
      checkedAt,
    };
  }

  let hermesTerminalCwd: string | null = null;
  try {
    hermesTerminalCwd = normalizeTerminalCwd(await inspectTerminalCwd());
  } catch {
    warnings.push(
      "Le dossier est accessible à la Console, mais le CLI Hermes local n’a pas permis de confirmer terminal.cwd.",
    );
  }

  if (!hermesTerminalCwd) {
    return {
      transport: "direct",
      scope: "local",
      configRevision: runtime.configRevision,
      proofLevel: "console_only",
      reasonCode: "DIRECT_WORKSPACE_CONSOLE_ONLY",
      sharedWorkdir,
      hermesTerminalCwd: null,
      warnings,
      blockers,
      restartRequired: !configured,
      checkedAt,
    };
  }

  if (path.resolve(hermesTerminalCwd) !== sharedPath) {
    blockers.push(
      "Hermes et la Console doivent voir le dossier partagé sous le même chemin absolu.",
    );
    return {
      transport: "direct",
      scope: "local",
      configRevision: runtime.configRevision,
      proofLevel: "misaligned",
      reasonCode: "DIRECT_WORKSPACE_MISALIGNED",
      sharedWorkdir,
      hermesTerminalCwd,
      warnings,
      blockers,
      restartRequired: true,
      checkedAt,
    };
  }

  return {
    transport: "direct",
    scope: "local",
    configRevision: runtime.configRevision,
    proofLevel: "verified",
    reasonCode: "DIRECT_WORKSPACE_VERIFIED",
    sharedWorkdir,
    hermesTerminalCwd,
    warnings,
    blockers,
    restartRequired: false,
    checkedAt,
  };
}

async function inspectLocalHermesTerminalCwd() {
  const result = await runHermesCommand(["config", "get", "terminal.cwd"], {
    timeoutMs: 5_000,
  });
  return result.stdout;
}

async function inspectLocalPath(target: string) {
  try {
    const info = await lstat(target);
    const symlink = info.isSymbolicLink();
    if (!info.isDirectory() || symlink) {
      return { exists: info.isDirectory(), readable: false, writable: false, symlink };
    }
    const [readable, writable] = await Promise.all([
      access(target, constants.R_OK).then(() => true, () => false),
      access(target, constants.W_OK).then(() => true, () => false),
    ]);
    return { exists: true, readable, writable, symlink: false };
  } catch {
    return { exists: false, readable: false, writable: false, symlink: false };
  }
}

function isLoopbackUrl(value: string | null) {
  if (!value) return false;
  try {
    return ["127.0.0.1", "localhost", "::1"].includes(new URL(value).hostname);
  } catch {
    return false;
  }
}

function normalizeTerminalCwd(value: string | null) {
  const lastLine = value
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);
  return lastLine?.startsWith("/") ? path.resolve(lastLine) : null;
}
