import { spawn } from "node:child_process";
import type {
  HermesRuntimeUpdateMethod,
  HermesRuntimeUpdatePlanDto,
  HermesRuntimeUpdateResultDto,
  RuntimePublicDto,
} from "@console/core/types/api";
import {
  getRuntimePublic,
  getStoredSshRuntime,
  probeAndPersistRuntime,
} from "./config";
import { HermesRuntimeError } from "./hermes-adapter";
import { withEphemeralSshChannel } from "./ssh";
import type { SshCommandSession } from "./ssh/types";
import {
  parseRemoteUpdateManagerResult,
  remoteUpdateManagerInspectCommand,
  remoteUpdateManagerUpdateCommand,
} from "./ssh/remote-update-manager";
import { withRuntimeMutationLease } from "@/modules/runs/active-runtime-guard";
import { getHermesReleases } from "@/modules/updates/hermes-releases";

const COMMAND_TIMEOUT_MS = 15 * 60 * 1000;
const HEALTH_TIMEOUT_MS = 3 * 60 * 1000;
const OUTPUT_LIMIT = 32_000;

type CommandResult = { stdout: string; stderr: string; code: number };
type Installation = {
  method: HermesRuntimeUpdateMethod;
  supported: boolean;
  reason: string | null;
  nativeCommand?: string;
  composeFile?: string;
  composeDir?: string;
  composeService?: string;
  imageRef?: string;
  remoteManager?: true;
};

export type RuntimeUpdateProgress = (update: {
  phase: "preflight" | "backup" | "download" | "apply" | "verify" | "rollback" | "complete";
  progress: number;
  message: string;
}) => void | Promise<void>;

type DockerCheckpoint = {
  imageId: string;
  imageRef: string;
  backupFile: string;
  legacyContainer: string | null;
};

const INSPECT_SCRIPT = [
  "set -eu",
  'export PATH="$HOME/.local/bin:$HOME/.bun/bin:/usr/local/bin:/opt/hermes/.venv/bin:$PATH"',
  "if command -v docker >/dev/null 2>&1 && docker inspect hermes-console-runtime >/dev/null 2>&1; then",
  "  printf 'mode=docker\\n'",
  "  docker inspect -f 'managed={{index .Config.Labels \"com.hermes-console.managed\"}}' hermes-console-runtime",
  "  docker inspect -f 'compose_file={{index .Config.Labels \"com.docker.compose.project.config_files\"}}' hermes-console-runtime",
  "  docker inspect -f 'compose_dir={{index .Config.Labels \"com.docker.compose.project.working_dir\"}}' hermes-console-runtime",
  "  docker inspect -f 'compose_service={{index .Config.Labels \"com.docker.compose.service\"}}' hermes-console-runtime",
  "  docker inspect -f 'image_ref={{.Config.Image}}' hermes-console-runtime",
  "  if [ -z \"$(docker inspect -f '{{index .Config.Labels \"com.docker.compose.project.config_files\"}}' hermes-console-runtime)\" ] && [ -f /opt/hermes-console-runtime/compose.yml ] && grep -Fq 'com.hermes-console.managed:' /opt/hermes-console-runtime/compose.yml && docker compose -f /opt/hermes-console-runtime/compose.yml config --quiet && [ \"$(docker compose -f /opt/hermes-console-runtime/compose.yml config --images | sed -n '1p')\" = \"$(docker inspect -f '{{.Config.Image}}' hermes-console-runtime)\" ]; then",
  "    printf 'managed=true\\ncompose_file=/opt/hermes-console-runtime/compose.yml\\ncompose_dir=/opt/hermes-console-runtime\\ncompose_service=hermes\\n'",
  "  fi",
  "else",
  "  hermes_bin=''",
  "  for candidate in \"$(command -v hermes 2>/dev/null || true)\" \"$HOME/.local/bin/hermes\" /usr/local/bin/hermes /usr/bin/hermes /opt/hermes/.venv/bin/hermes; do",
  "    if [ -n \"$candidate\" ] && [ -x \"$candidate\" ]; then hermes_bin=$candidate; break; fi",
  "  done",
  "  if [ -n \"$hermes_bin\" ]; then printf 'mode=native\\nnative_command=%s\\n' \"$hermes_bin\"; else printf 'mode=unknown\\n'; fi",
  "fi",
].join("\n");

function parseVersion(value: string | null | undefined) {
  const match = value?.match(/(?:^|\s|v)(\d+)\.(\d+)\.(\d+)(?:\b|[-+])/i);
  if (!match) return null;
  return {
    value: `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`,
    parts: [Number(match[1]), Number(match[2]), Number(match[3])] as const,
  };
}

function compareVersions(left: readonly number[], right: readonly number[]) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function parseKeyValues(output: string) {
  const values = new Map<string, string>();
  for (const line of output.split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator > 0) values.set(line.slice(0, separator), line.slice(separator + 1).trim());
  }
  return values;
}

function isLoopback(baseUrl: string | null) {
  if (!baseUrl) return false;
  try {
    return ["127.0.0.1", "localhost", "::1"].includes(new URL(baseUrl).hostname);
  } catch {
    return false;
  }
}

async function currentRuntime() {
  try {
    return (await probeAndPersistRuntime()).runtime;
  } catch {
    return getRuntimePublic();
  }
}

async function inspectInstallation(runtime: RuntimePublicDto): Promise<Installation> {
  if (!runtime.configured) {
    return { method: "unknown", supported: false, reason: "Aucun runtime Hermes n’est configuré." };
  }
  if (runtime.transport !== "ssh" && !isLoopback(runtime.baseUrl)) {
    return {
      method: "external",
      supported: false,
      reason: "Ce runtime distant n’a pas de canal SSH administrable par la Console.",
    };
  }
  if (runtime.transport === "ssh") {
    const managedResult = await runOnRuntimeHost(
      runtime,
      remoteUpdateManagerInspectCommand(),
      20_000,
    );
    if (managedResult.code === 0) {
      const managedValues = parseKeyValues(managedResult.stdout);
      if (managedValues.get("managed") !== "true") {
        return {
          method: "external",
          supported: false,
          reason: "Le gestionnaire distant n’a pas confirmé une installation Hermes gérée.",
        };
      }
      if (managedValues.get("mode") === "native") {
        return {
          method: "native",
          supported: true,
          reason: null,
          remoteManager: true,
        };
      }
      if (managedValues.get("mode") === "docker") {
        return {
          method: "docker-compose",
          supported: true,
          reason: null,
          remoteManager: true,
        };
      }
      return {
        method: "unknown",
        supported: false,
        reason: "Le gestionnaire distant a retourné une topologie Hermes inconnue.",
      };
    }
    if (runtime.managementMode === "managed") {
      return {
        method: "unknown",
        supported: false,
        reason: "Le gestionnaire de mise à jour distante est absent ou refuse cette topologie gérée.",
      };
    }
  }
  const result = await runOnRuntimeHost(runtime, INSPECT_SCRIPT, 20_000);
  if (result.code !== 0) {
    return { method: "unknown", supported: false, reason: "Le mode d’installation Hermes est indétectable." };
  }
  const values = parseKeyValues(result.stdout);
  if (values.get("mode") === "native") {
    const nativeCommand = values.get("native_command") ?? "";
    if (!nativeCommand.startsWith("/") || !/^[a-zA-Z0-9._/+-]+$/.test(nativeCommand)) {
      return { method: "unknown", supported: false, reason: "Le binaire Hermes système est introuvable ou non sûr." };
    }
    return { method: "native", supported: true, reason: null, nativeCommand };
  }
  if (values.get("mode") !== "docker") {
    return { method: "unknown", supported: false, reason: "Hermes CLI ou Docker est introuvable sur l’hôte." };
  }
  const composeFile = values.get("compose_file") ?? "";
  const composeDir = values.get("compose_dir") ?? "";
  const composeService = values.get("compose_service") ?? "";
  const imageRef = values.get("image_ref") ?? "";
  const managed = values.get("managed") === "true";
  const safeCompose = composeFile.startsWith("/") && !composeFile.includes(",") && composeDir.startsWith("/");
  const safeService = /^[a-zA-Z0-9._-]+$/.test(composeService);
  const safeImage = /^nousresearch\/hermes-agent@sha256:[a-f0-9]{64}$/.test(imageRef);
  if (!managed || !safeCompose || !safeService || !safeImage) {
    return {
      method: "external",
      supported: false,
      reason: "Le conteneur Docker doit être une topologie Compose Hermes gérée, avec une image officielle épinglée par digest.",
    };
  }
  return {
    method: "docker-compose",
    supported: true,
    reason: null,
    composeFile,
    composeDir,
    composeService,
    imageRef,
  };
}

export async function getRuntimeUpdatePlan(): Promise<HermesRuntimeUpdatePlanDto> {
  const [runtime, releaseResult] = await Promise.all([
    currentRuntime(),
    getHermesReleases(10, false),
  ]);
  const release = releaseResult.releases.find((candidate) => !candidate.prerelease) ?? null;
  const installation = await inspectInstallation(runtime);
  const current = parseVersion(runtime.detectedVersion);
  const latest = parseVersion(release?.name ?? release?.tagName);
  const available = Boolean(current && latest && compareVersions(current.parts, latest.parts) < 0);
  let reason = installation.reason;
  if (!reason && !current) reason = "La version installée n’a pas pu être déterminée.";
  if (!reason && !latest) reason = "La version de la dernière release n’a pas pu être déterminée.";
  return {
    supported: installation.supported,
    available,
    method: installation.method,
    transport: runtime.transport,
    configRevision: runtime.configRevision,
    currentVersion: current?.value ?? runtime.detectedVersion,
    latestVersion: latest?.value ?? null,
    latestTag: release?.tagName ?? null,
    releaseName: release?.name ?? null,
    releaseUrl: release?.htmlUrl ?? null,
    reason,
    checkedAt: new Date().toISOString(),
  };
}

export async function applyRuntimeUpdate(onProgress?: RuntimeUpdateProgress): Promise<HermesRuntimeUpdateResultDto> {
  return withRuntimeMutationLease(async () => {
    await onProgress?.({ phase: "preflight", progress: 5, message: "Revalidation du runtime et verrouillage des missions…" });
    const runtime = await currentRuntime();
    const before = await getRuntimeUpdatePlan();
    if (!before.available) {
      return {
        updated: false,
        rolledBack: false,
        previousVersion: before.currentVersion,
        currentVersion: before.currentVersion,
        method: before.method,
        plan: before,
      };
    }
    const installation = await inspectInstallation(runtime);
    if (!installation.supported) {
      throw new HermesRuntimeError(
        installation.reason ?? "Cette installation Hermes ne peut pas être mise à jour automatiquement.",
        409,
        "HERMES_UPDATE_UNSUPPORTED",
      );
    }

    let dockerCheckpoint: DockerCheckpoint | null = null;
    let didApply = true;
    if (installation.remoteManager) {
      await onProgress?.({ phase: "backup", progress: 20, message: "Préparation du point de restauration distant…" });
      await onProgress?.({ phase: "apply", progress: 45, message: "Mise à jour de l’installation Hermes gérée…" });
      const result = await runOnRuntimeHost(
        runtime,
        remoteUpdateManagerUpdateCommand(),
        COMMAND_TIMEOUT_MS,
      );
      const managerResult = parseRemoteUpdateManagerResult(result);
      if (managerResult.status === "rolled_back") {
        throw new HermesRuntimeError(
          "La mise à jour distante a échoué, puis la version précédente a été restaurée.",
          502,
          "HERMES_UPDATE_ROLLED_BACK",
        );
      }
      if (managerResult.status === "recovery_required") {
        throw new HermesRuntimeError(
          "La mise à jour distante et son rollback ont échoué. Une intervention est requise.",
          500,
          "HERMES_UPDATE_RECOVERY_REQUIRED",
        );
      }
      if (managerResult.status === "failed") {
        throw new HermesRuntimeError(
          `La mise à jour distante Hermes a échoué : ${commandFailure(result)}.`,
          502,
          "HERMES_UPDATE_FAILED",
        );
      }
      didApply = managerResult.status === "updated";
    } else if (installation.method === "native") {
      await onProgress?.({ phase: "backup", progress: 20, message: "Création du backup Hermes système…" });
      await onProgress?.({ phase: "apply", progress: 45, message: "Installation de la nouvelle version Hermes…" });
      const result = await runOnRuntimeHost(
        runtime,
        `set -eu\n${shellQuote(installation.nativeCommand!)} update --yes --backup`,
        COMMAND_TIMEOUT_MS,
      );
      if (result.code !== 0) {
        throw new HermesRuntimeError("La mise à jour native Hermes a échoué. Le snapshot pré-update est conservé.", 502, "HERMES_UPDATE_FAILED");
      }
    } else if (installation.method === "docker-compose") {
      await onProgress?.({ phase: "download", progress: 25, message: "Téléchargement et résolution du nouveau digest Docker…" });
      const result = await runOnRuntimeHost(runtime, dockerUpdateScript(installation), COMMAND_TIMEOUT_MS);
      const values = parseKeyValues(result.stdout);
      const imageId = values.get("previous_image") ?? "";
      const imageRef = values.get("image_ref") ?? "";
      const backupFile = values.get("backup_file") ?? "";
      const legacyContainer = values.get("legacy_container") ?? "";
      if (
        /^sha256:[a-f0-9]{64}$/.test(imageId) &&
        imageRef === installation.imageRef &&
        backupFile.startsWith(`${installation.composeDir!}/.hermes-update-`) &&
        backupFile.endsWith(".yml") &&
        (legacyContainer === "" || /^hermes-console-runtime\.rollback\.\d+\.\d+$/.test(legacyContainer))
      ) {
        dockerCheckpoint = {
          imageId,
          imageRef,
          backupFile,
          legacyContainer: legacyContainer || null,
        };
      }
      if (result.code !== 0) {
        const updateFailure = commandFailure(result);
        if (dockerCheckpoint) {
          await onProgress?.({ phase: "rollback", progress: 90, message: "Échec de recréation, restauration du Compose précédent…" });
          try {
            await rollbackDocker(runtime, installation, dockerCheckpoint);
          } catch (rollbackError) {
            throw new HermesRuntimeError(
              `La mise à jour et son rollback ont échoué. Mise à jour : ${updateFailure}. Rollback : ${errorMessage(rollbackError)}.`,
              500,
              "HERMES_UPDATE_RECOVERY_REQUIRED",
            );
          }
          throw new HermesRuntimeError(
            `La recréation Docker a échoué, puis l’image précédente a été restaurée. Cause : ${updateFailure}.`,
            502,
            "HERMES_UPDATE_ROLLED_BACK",
          );
        }
        throw new HermesRuntimeError(
          `La recréation Docker Hermes a échoué avant la création d’un checkpoint exploitable : ${updateFailure}.`,
          502,
          "HERMES_UPDATE_FAILED",
        );
      }
    }

    try {
      await onProgress?.({ phase: "verify", progress: 82, message: "Vérification de la santé et de la version du runtime…" });
      const recovered = await waitForHealthyRuntime();
      const plan = await getRuntimeUpdatePlan();
      if (dockerCheckpoint) await cleanupDockerCheckpoint(runtime, dockerCheckpoint);
      await onProgress?.({ phase: "complete", progress: 100, message: "Hermes est à jour et le runtime est sain." });
      return {
        updated: didApply,
        rolledBack: false,
        previousVersion: before.currentVersion,
        currentVersion: recovered.detectedVersion ?? plan.currentVersion,
        method: before.method,
        plan,
      };
    } catch (error) {
      if (dockerCheckpoint && installation.method === "docker-compose") {
        await onProgress?.({ phase: "rollback", progress: 92, message: "Le runtime est indisponible, rollback automatique…" });
        await rollbackDocker(runtime, installation, dockerCheckpoint);
        await waitForHealthyRuntime();
        throw new HermesRuntimeError(
          "La nouvelle image n’est pas devenue saine. L’image Docker précédente a été restaurée.",
          502,
          "HERMES_UPDATE_ROLLED_BACK",
        );
      }
      throw error;
    }
  });
}

function dockerUpdateScript(installation: Installation) {
  return [
    "set -eu",
    `cd ${shellQuote(installation.composeDir!)}`,
    "previous_image=$(docker inspect -f '{{.Image}}' hermes-console-runtime)",
    "image_ref=$(docker inspect -f '{{.Config.Image}}' hermes-console-runtime)",
    `test \"$image_ref\" = ${shellQuote(installation.imageRef!)}`,
    "target_ref=nousresearch/hermes-agent:latest",
    "docker pull \"$target_ref\"",
    "target_digest=$(docker image inspect -f '{{index .RepoDigests 0}}' \"$target_ref\")",
    "case \"$target_digest\" in nousresearch/hermes-agent@sha256:????????????????????????????????????????????????????????????????) ;; *) printf 'Digest Docker Hermes invalide: %s\\n' \"$target_digest\" >&2; exit 42 ;; esac",
    `compose_file=${shellQuote(installation.composeFile!)}`,
    `backup_file=${shellQuote(`${installation.composeDir!}/.hermes-update-`)}$(date +%s)-$$.yml`,
    "compose_service=$(docker inspect -f '{{index .Config.Labels \"com.docker.compose.service\"}}' hermes-console-runtime)",
    "legacy_container=",
    "if [ -z \"$compose_service\" ]; then legacy_container=hermes-console-runtime.rollback.$(date +%s).$$; fi",
    "cp -- \"$compose_file\" \"$backup_file\"",
    "chmod 0600 \"$backup_file\"",
    "printf 'previous_image=%s\\nimage_ref=%s\\nbackup_file=%s\\nlegacy_container=%s\\n' \"$previous_image\" \"$image_ref\" \"$backup_file\" \"$legacy_container\"",
    "tmp_file=${compose_file}.tmp.$$",
    "trap 'rm -f \"$tmp_file\"' EXIT",
    "awk -v old=\"$image_ref\" -v new=\"$target_digest\" '$1 == \"image:\" && $2 == old { position = index($0, old); $0 = substr($0, 1, position - 1) new substr($0, position + length(old)); changed += 1 } { print } END { if (changed != 1) exit 42 }' \"$compose_file\" > \"$tmp_file\"",
    "chmod --reference=\"$compose_file\" \"$tmp_file\" 2>/dev/null || chmod 0600 \"$tmp_file\"",
    "mv -- \"$tmp_file\" \"$compose_file\"",
    `docker compose -f ${shellQuote(installation.composeFile!)} config --quiet`,
    "if [ -n \"$legacy_container\" ]; then docker stop hermes-console-runtime; docker rename hermes-console-runtime \"$legacy_container\"; fi",
    `docker compose -f ${shellQuote(installation.composeFile!)} up -d --no-build --force-recreate ${shellQuote(installation.composeService!)}`,
  ].join("\n");
}

async function rollbackDocker(
  runtime: RuntimePublicDto,
  installation: Installation,
  checkpoint: DockerCheckpoint,
) {
  const restoreRuntime = checkpoint.legacyContainer
    ? [
        `if docker inspect ${shellQuote(checkpoint.legacyContainer)} >/dev/null 2>&1; then`,
        "  docker rm -f hermes-console-runtime >/dev/null 2>&1 || true",
        `  docker rename ${shellQuote(checkpoint.legacyContainer)} hermes-console-runtime`,
        "fi",
        "docker start hermes-console-runtime >/dev/null",
      ]
    : [
        `docker compose -f ${shellQuote(installation.composeFile!)} up -d --no-build --force-recreate ${shellQuote(installation.composeService!)}`,
      ];
  const result = await runOnRuntimeHost(
    runtime,
    [
      "set -eu",
      `cd ${shellQuote(installation.composeDir!)}`,
      `test -f ${shellQuote(checkpoint.backupFile)}`,
      `cp -- ${shellQuote(checkpoint.backupFile)} ${shellQuote(installation.composeFile!)}`,
      `docker compose -f ${shellQuote(installation.composeFile!)} config --quiet`,
      ...restoreRuntime,
    ].join("\n"),
    3 * 60 * 1000,
  );
  if (result.code !== 0) {
    throw new HermesRuntimeError(
      `Le rollback Docker Hermes a échoué et nécessite une intervention : ${commandFailure(result)}.`,
      500,
      "HERMES_UPDATE_RECOVERY_REQUIRED",
    );
  }
}

async function cleanupDockerCheckpoint(
  runtime: RuntimePublicDto,
  checkpoint: DockerCheckpoint,
) {
  const removeLegacy = checkpoint.legacyContainer
    ? `docker rm -f -- ${shellQuote(checkpoint.legacyContainer)} >/dev/null 2>&1 || true\n`
    : "";
  await runOnRuntimeHost(
    runtime,
    `${removeLegacy}rm -f -- ${shellQuote(checkpoint.backupFile)}`,
    20_000,
  ).catch(() => undefined);
}

async function waitForHealthyRuntime() {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      return (await probeAndPersistRuntime()).runtime;
    } catch (error) {
      lastError = error;
    }
  }
  throw new HermesRuntimeError(
    lastError instanceof Error ? `Hermes n’est pas redevenu sain (${lastError.message}).` : "Hermes n’est pas redevenu sain.",
    504,
    "HERMES_UPDATE_HEALTH_TIMEOUT",
  );
}

async function runOnRuntimeHost(runtime: RuntimePublicDto, script: string, timeoutMs: number) {
  if (runtime.transport === "ssh") {
    const stored = await getStoredSshRuntime(runtime.configRevision ?? undefined);
    return withEphemeralSshChannel(stored.target, async (channel) => {
      const session = await channel.start(script);
      session.endInput();
      return waitForSession(session, timeoutMs);
    });
  }
  return runLocalScript(script, timeoutMs);
}

function waitForSession(session: SshCommandSession, timeoutMs: number): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      session.kill();
      reject(new HermesRuntimeError("La commande de mise à jour a dépassé le délai autorisé.", 504, "HERMES_UPDATE_TIMEOUT"));
    }, timeoutMs);
    session.result.then(
      (result) => { clearTimeout(timer); resolve(result); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function runLocalScript(script: string, timeoutMs: number): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("/bin/sh", ["-lc", script], {
      env: { ...process.env, NO_COLOR: "1", PYTHONUNBUFFERED: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout = `${stdout}${chunk}`.slice(-OUTPUT_LIMIT); });
    child.stderr.on("data", (chunk: Buffer) => { stderr = `${stderr}${chunk}`.slice(-OUTPUT_LIMIT); });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new HermesRuntimeError("La commande de mise à jour a dépassé le délai autorisé.", 504, "HERMES_UPDATE_TIMEOUT"));
    }, timeoutMs);
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: typeof code === "number" ? code : 1 });
    });
  });
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function commandFailure(result: CommandResult) {
  const output = (result.stderr || result.stdout).trim().replaceAll(/\s+/g, " ");
  return output ? `${output.slice(-800)} (code ${result.code})` : `code de sortie ${result.code}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
