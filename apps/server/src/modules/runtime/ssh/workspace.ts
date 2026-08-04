import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import type {
  RuntimeSshWorkspaceCandidateDto,
  RuntimeSshWorkspaceDiscoveryDto,
} from "@console/core/types/api";
import {
  getStoredSshRuntime,
  persistSshWorkspace,
  requireDurableRemoteWorkdir,
} from "../config";
import { HermesRuntimeError } from "../hermes-adapter";
import { withEphemeralSshChannel, type SshChannel } from "./index";
import {
  withRuntimeMutationLease,
  type RuntimeMutationLease,
} from "@/modules/runs/active-runtime-guard";

export type WorkspaceInspection = {
  mode: "native" | "docker" | "unknown";
  home: string | null;
  hermesHome: string | null;
  terminalCwd: string | null;
  resolvedTerminalCwd: string | null;
  dockerMount: {
    type: "bind" | "volume";
    source: string;
    destination: string;
    name: string | null;
    driver: string | null;
  } | null;
  containerName: string | null;
  ambiguousDocker: boolean;
  dockerComposeAvailable: boolean;
  nativeServiceUser: string | null;
};

type PathState = { exists: boolean; writable: boolean; symlink?: boolean };

export function parseWorkspaceInspection(output: string): WorkspaceInspection {
  const values = parseKeyValueOutput(output);
  const mode =
    values.mode === "docker" || values.mode === "native"
      ? values.mode
      : "unknown";
  const mountType =
    values.mount_type === "bind" || values.mount_type === "volume"
      ? values.mount_type
      : null;
  return {
    mode,
    home: absoluteOrNull(values.home),
    hermesHome: absoluteOrNull(values.hermes_home),
    terminalCwd: values.terminal_cwd?.trim() || null,
    resolvedTerminalCwd: absoluteOrNull(values.resolved_cwd),
    dockerMount:
      mountType && values.mount_source && absoluteOrValue(values.mount_source) && values.mount_destination
        ? {
            type: mountType,
            source: values.mount_source.trim(),
            destination: values.mount_destination.trim(),
            name: values.mount_name?.trim() || null,
            driver: values.mount_driver?.trim() || null,
          }
        : null,
    containerName: values.container_name?.trim() || null,
    ambiguousDocker: values.docker_ambiguous === "yes",
    dockerComposeAvailable: values.docker_compose === "available",
    nativeServiceUser: values.native_service_user?.trim() || null,
  };
}

export function buildWorkspaceCandidates(
  inspection: WorkspaceInspection,
  states: Record<string, PathState>,
): RuntimeSshWorkspaceCandidateDto[] {
  const raw: Array<{
    source: RuntimeSshWorkspaceCandidateDto["source"];
    label: string;
    host: string;
    hermes: string;
  }> = [];

  if (inspection.ambiguousDocker) return [];

  if (inspection.mode === "docker") {
    const mount = inspection.dockerMount;
    if (!mount || mount.type !== "bind") return [];
    const terminalHost = inspection.resolvedTerminalCwd
      ? mapContainerPathToHost(inspection.resolvedTerminalCwd, mount)
      : null;
    if (
      terminalHost &&
      inspection.resolvedTerminalCwd &&
      inspection.resolvedTerminalCwd !== mount.destination
    ) {
      raw.push({
        source: "terminal_cwd",
        label: "Dossier configuré dans Hermes",
        host: terminalHost,
        hermes: inspection.resolvedTerminalCwd,
      });
    }
    raw.push({
      source: "hermes_workspace",
      label: "Workspace Hermes recommandé",
      host: path.posix.join(mount.source, "workspace"),
      hermes: path.posix.join(mount.destination, "workspace"),
    });
  } else {
    if (
      inspection.resolvedTerminalCwd &&
      inspection.resolvedTerminalCwd !== inspection.home
    ) {
      raw.push({
        source: "terminal_cwd",
        label: "Dossier configuré dans Hermes",
        host: inspection.resolvedTerminalCwd,
        hermes: inspection.resolvedTerminalCwd,
      });
    }
    if (inspection.hermesHome) {
      raw.push({
        source: "hermes_workspace",
        label: "Workspace Hermes recommandé",
        host: path.posix.join(inspection.hermesHome, "workspace"),
        hermes: path.posix.join(inspection.hermesHome, "workspace"),
      });
    }
    if (inspection.mode === "unknown") {
      raw.push({
        source: "console_managed",
        label: "Dossier géré par la Console",
        host: "/srv/hermes-console/workdir",
        hermes: "/srv/hermes-console/workdir",
      });
    }
  }

  const seen = new Set<string>();
  const candidates: RuntimeSshWorkspaceCandidateDto[] = [];
  for (const item of raw) {
    let host: string;
    let hermes: string;
    try {
      host = requireDurableRemoteWorkdir(item.host);
      hermes = requireDurableRemoteWorkdir(item.hermes);
    } catch {
      continue;
    }
    const key = `${host}\0${hermes}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const state = states[host] ?? { exists: false, writable: false };
    candidates.push({
      id: `${item.source}:${candidates.length + 1}`,
      source: item.source,
      label: item.label,
      remoteWorkdir: host,
      remoteHermesWorkdir: hermes,
      exists: state.exists,
      writable: state.writable,
      durable: true,
      recommended: false,
      requiresCreation: !state.exists,
      warning: state.writable
        ? state.symlink
          ? "Les liens symboliques ne peuvent pas être activés comme racine de travail."
          : null
        : state.exists
          ? "Le compte SSH ne peut pas écrire dans ce dossier."
          : "Le dossier parent n’est pas inscriptible par le compte SSH.",
    });
  }
  const recommended =
    candidates.find((candidate) => candidate.source === "terminal_cwd" && candidate.writable) ??
    candidates.find((candidate) => candidate.source === "hermes_workspace" && candidate.writable) ??
    candidates.find((candidate) => candidate.writable);
  if (recommended) recommended.recommended = true;
  return candidates;
}

export async function discoverSshWorkspace(
  expectedRevision?: number,
): Promise<RuntimeSshWorkspaceDiscoveryDto> {
  const stored = await getStoredSshRuntime(expectedRevision);
  return withEphemeralSshChannel(stored.target, async (channel) => {
    const result = await channel.exec(workspaceInspectionCommand(stored.target.user));
    if (result.code !== 0) throw remoteCommandError(result);
    const inspection = parseWorkspaceInspection(result.stdout);
    const seed = buildWorkspaceCandidates(inspection, {});
    const states: Record<string, PathState> = {};
    for (const candidate of seed) {
      states[candidate.remoteWorkdir] = await inspectPath(
        channel,
        candidate.remoteWorkdir,
      );
    }
    const candidates = buildWorkspaceCandidates(inspection, states);
    const warnings: string[] = [];
    const blockers: string[] = [];
    let storageMigration: RuntimeSshWorkspaceDiscoveryDto["storageMigration"];
    if (inspection.mode === "unknown") {
      warnings.push("Hermes n’a pas été identifié comme service natif ou conteneur géré par la Console.");
    }
    if (inspection.dockerMount?.type === "volume") {
      blockers.push(
        "Le volume Docker /opt/data n’expose aucun chemin hôte utilisable en SFTP. Recréez le conteneur avec un bind mount.",
      );
      const eligible =
        inspection.containerName === "hermes-console-runtime" &&
        stored.target.user === "root" &&
        inspection.dockerMount.driver === "local" &&
        Boolean(inspection.dockerMount.name) &&
        inspection.dockerComposeAvailable;
      storageMigration = {
        state: eligible ? "available" : "manual_required",
        reasonCode: eligible
          ? "SSH_DOCKER_VOLUME_MIGRATION_AVAILABLE"
          : "SSH_DOCKER_VOLUME_MIGRATION_MANUAL_REQUIRED",
        defaultTargetRoot: "/srv/hermes-console/data",
        sourceVolume: inspection.dockerMount.name,
        sourceBytes: null,
      };
    }
    if (inspection.ambiguousDocker) {
      blockers.push(
        "Plusieurs conteneurs Hermes sont actifs. Arrêtez les doublons ou nommez la cible hermes-console-runtime.",
      );
    }
    if (inspection.mode === "native" && !inspection.nativeServiceUser) {
      blockers.push(
        "Le service Hermes natif n’est pas attribuable avec certitude au compte SSH ; son workspace ne peut pas être activé automatiquement.",
      );
    }
    if (candidates.length === 0 && blockers.length === 0) {
      blockers.push("Aucun dossier durable accessible à la fois par la Console et Hermes n’a été trouvé.");
    }
    return {
      configRevision: stored.configRevision,
      installation: {
        mode: inspection.mode,
        hermesHome: inspection.hermesHome,
        terminalCwd: inspection.terminalCwd,
        resolvedTerminalCwd: inspection.resolvedTerminalCwd,
        dockerMount: inspection.dockerMount
          ? {
              type: inspection.dockerMount.type,
              source: inspection.dockerMount.source,
              destination: inspection.dockerMount.destination,
            }
          : null,
      },
      candidates,
      warnings,
      blockers,
      storageMigration,
      checkedAt: new Date().toISOString(),
    };
  });
}

export async function checkSshWorkspace(input: {
  remoteWorkdir: string;
  remoteHermesWorkdir?: string;
}) {
  const stored = await getStoredSshRuntime();
  const remoteWorkdir = requireDurableRemoteWorkdir(input.remoteWorkdir);
  const remoteHermesWorkdir = requireDurableRemoteWorkdir(
    input.remoteHermesWorkdir ?? remoteWorkdir,
  );
  const state = await withEphemeralSshChannel(stored.target, async (channel) => {
    const inspectionResult = await channel.exec(workspaceInspectionCommand(stored.target.user));
    if (inspectionResult.code !== 0) throw remoteCommandError(inspectionResult);
    validateWorkspaceMapping(
      parseWorkspaceInspection(inspectionResult.stdout),
      remoteWorkdir,
      remoteHermesWorkdir,
    );
    return inspectPath(channel, remoteWorkdir);
  });
  return toManualCandidate(remoteWorkdir, remoteHermesWorkdir, state);
}

export async function activateSshWorkspace(input: {
  remoteWorkdir: string;
  remoteHermesWorkdir: string;
  create?: boolean;
  alignHermesCwd?: boolean;
  expectedRevision: number;
}, mutationLease?: RuntimeMutationLease) {
  return withRuntimeMutationLease(
    () => activateSshWorkspaceUnlocked(input),
    mutationLease,
  );
}

async function activateSshWorkspaceUnlocked(input: {
  remoteWorkdir: string;
  remoteHermesWorkdir: string;
  create?: boolean;
  alignHermesCwd?: boolean;
  expectedRevision: number;
}) {
  const stored = await getStoredSshRuntime(input.expectedRevision);
  const remoteWorkdir = requireDurableRemoteWorkdir(input.remoteWorkdir);
  const remoteHermesWorkdir = requireDurableRemoteWorkdir(input.remoteHermesWorkdir);

  return withEphemeralSshChannel(stored.target, async (channel) => {
    if (input.create) {
      await (await channel.sftp()).mkdirp(remoteWorkdir);
    }
    const state = await inspectPath(channel, remoteWorkdir);
    if (!state.exists || !state.writable || state.symlink) {
      throw new HermesRuntimeError(
        "Le dossier distant doit exister et être inscriptible avant son activation.",
        409,
        "SSH_WORKSPACE_NOT_WRITABLE",
      );
    }
    const discoveryResult = await channel.exec(workspaceInspectionCommand(stored.target.user));
    if (discoveryResult.code !== 0) throw remoteCommandError(discoveryResult);
    const inspection = parseWorkspaceInspection(discoveryResult.stdout);
    validateWorkspaceMapping(inspection, remoteWorkdir, remoteHermesWorkdir);
    const rollback = input.alignHermesCwd
      ? await alignTerminalCwd(channel, inspection, remoteHermesWorkdir, stored.target.user)
      : null;
    return withTerminalCwdRollback(async () => {
      await verifySftpRoundTrip(channel, remoteWorkdir);
      await probeHermesWorkspaceAccess(
        channel,
        inspection,
        remoteHermesWorkdir,
        stored.target.user,
      );
      const runtime = await persistSshWorkspace({
        remoteWorkdir,
        remoteHermesWorkdir,
        expectedRevision: input.expectedRevision,
      });
      return {
        runtime,
        candidate: toManualCandidate(remoteWorkdir, remoteHermesWorkdir, state),
      };
    }, rollback);
  });
}

function workspaceInspectionCommand(user: string) {
  const docker = user === "root" ? "docker" : "sudo -n docker";
  return [
    "set +e",
    'home_dir="${HOME:-$(getent passwd \"$(id -un)\" 2>/dev/null | cut -d: -f6)}"',
    'printf "home=%s\\n" "$home_dir"',
    `hermes_container=""; docker_ambiguous=no; if ${docker} inspect hermes-console-runtime >/dev/null 2>&1; then hermes_container=hermes-console-runtime; else hermes_containers="$(${docker} ps --format '{{.Image}}|{{.Names}}' 2>/dev/null | awk -F'|' '$1 ~ /nousresearch\\/hermes-agent/ { print $2 }')"; hermes_count="$(printf '%s\\n' "$hermes_containers" | sed '/^$/d' | wc -l | tr -d ' ')"; if [ "$hermes_count" = 1 ]; then hermes_container="$hermes_containers"; elif [ "$hermes_count" -gt 1 ]; then docker_ambiguous=yes; fi; fi`,
    'printf "docker_ambiguous=%s\\n" "$docker_ambiguous"',
    'if [ -n "$hermes_container" ]; then',
    '  printf "mode=docker\\nhermes_home=/opt/data\\n"',
    '  printf "container_name=%s\\n" "$hermes_container"',
    `  terminal_cwd="$(${docker} exec "$hermes_container" hermes config get terminal.cwd 2>/dev/null | tail -n 1)"`,
    '  [ -n "$terminal_cwd" ] || terminal_cwd="."',
    '  if [ "$terminal_cwd" = "." ]; then resolved_cwd=/opt/data; else resolved_cwd="$terminal_cwd"; fi',
    `  ${docker} inspect -f '{{range .Mounts}}{{if eq .Destination "/opt/data"}}{{printf "mount_type=%s\\nmount_source=%s\\nmount_destination=%s\\nmount_name=%s\\nmount_driver=%s\\n" .Type .Source .Destination .Name .Driver}}{{end}}{{end}}' "$hermes_container" 2>/dev/null`,
    `  if ${docker} compose version >/dev/null 2>&1; then printf "docker_compose=available\\n"; else printf "docker_compose=missing\\n"; fi`,
    "elif command -v hermes >/dev/null 2>&1; then",
    '  printf "mode=native\\n"',
    '  if command -v systemctl >/dev/null 2>&1 && systemctl --user is-active --quiet hermes-gateway.service 2>/dev/null; then printf "native_service_user=%s\\n" "$(id -un)"; fi',
    '  hermes_home="${HERMES_HOME:-$home_dir/.hermes}"',
    '  printf "hermes_home=%s\\n" "$hermes_home"',
    '  terminal_cwd="$(hermes config get terminal.cwd 2>/dev/null | tail -n 1)"',
    '  [ -n "$terminal_cwd" ] || terminal_cwd="."',
    '  if [ "$terminal_cwd" = "." ]; then resolved_cwd="$home_dir"; elif [ "${terminal_cwd#/}" != "$terminal_cwd" ]; then resolved_cwd="$terminal_cwd"; else resolved_cwd="$home_dir/$terminal_cwd"; fi',
    "else",
    '  printf "mode=unknown\\n"',
    '  hermes_home="$home_dir/.hermes"; terminal_cwd="."; resolved_cwd="$home_dir"',
    "fi",
    'printf "terminal_cwd=%s\\nresolved_cwd=%s\\n" "$terminal_cwd" "$resolved_cwd"',
  ].join("\n");
}

async function inspectPath(channel: SshChannel, remotePath: string): Promise<PathState> {
  const result = await channel.exec([
    "set +e",
    `if [ -d ${shellQuote(remotePath)} ]; then exists=yes; else exists=no; fi`,
    `normalized=${shellQuote(path.posix.normalize(remotePath))}; resolved="$(realpath -m -- ${shellQuote(remotePath)} 2>/dev/null)"; if [ -L ${shellQuote(remotePath)} ] || { [ -n "$resolved" ] && [ "$resolved" != "$normalized" ]; }; then symlink=yes; else symlink=no; fi`,
    `probe=${shellQuote(remotePath)}; while [ ! -e "$probe" ] && [ "$probe" != / ]; do probe="$(dirname -- "$probe")"; done`,
    'if [ -d "$probe" ] && [ -w "$probe" ]; then writable=yes; else writable=no; fi',
    'printf "exists=%s\\nwritable=%s\\nsymlink=%s\\n" "$exists" "$writable" "$symlink"',
  ].join("\n"));
  if (result.code !== 0) throw remoteCommandError(result);
  const values = parseKeyValueOutput(result.stdout);
  return {
    exists: values.exists === "yes",
    writable: values.writable === "yes",
    symlink: values.symlink === "yes",
  };
}

function toManualCandidate(
  remoteWorkdir: string,
  remoteHermesWorkdir: string,
  state: PathState,
): RuntimeSshWorkspaceCandidateDto {
  return {
    id: "console_managed:manual",
    source: "console_managed",
    label: "Chemin personnalisé",
    remoteWorkdir,
    remoteHermesWorkdir,
    exists: state.exists,
    writable: state.writable,
    durable: true,
    recommended: state.writable,
    requiresCreation: !state.exists,
    warning: state.writable ? null : "Ce chemin n’est pas encore utilisable par le compte SSH.",
  };
}

function validateWorkspaceMapping(
  inspection: WorkspaceInspection,
  hostPath: string,
  hermesPath: string,
) {
  if (hostPath === inspection.home || hermesPath === inspection.hermesHome) {
    throw new HermesRuntimeError(
      "La racine du compte ou HERMES_HOME contient des données sensibles. Choisissez son sous-dossier workspace.",
      400,
      "SSH_WORKSPACE_ROOT_FORBIDDEN",
    );
  }
  if (inspection.mode === "unknown" || inspection.ambiguousDocker) {
    throw new HermesRuntimeError(
      "Hermes doit être identifié sans ambiguïté avant d’activer son dossier de travail.",
      409,
      "SSH_HERMES_MODE_UNKNOWN",
    );
  }
  if (inspection.mode === "native" && !inspection.nativeServiceUser) {
    throw new HermesRuntimeError(
      "Le compte du service Hermes natif n’a pas pu être vérifié.",
      409,
      "SSH_HERMES_RUNTIME_CONTEXT_UNVERIFIED",
    );
  }
  if (inspection.mode !== "docker") {
    if (hostPath !== hermesPath) {
      throw new HermesRuntimeError(
        "Une installation Hermes native doit utiliser le même chemin côté SSH et côté Hermes.",
        400,
        "SSH_WORKSPACE_MAPPING_INVALID",
      );
    }
    return;
  }
  const mount = inspection.dockerMount;
  if (!mount || mount.type !== "bind") {
    throw new HermesRuntimeError(
      "Le conteneur Hermes doit monter /opt/data depuis un chemin hôte avant l’activation SFTP.",
      409,
      "SSH_DOCKER_BIND_MOUNT_REQUIRED",
    );
  }
  const expectedHost = mapContainerPathToHost(hermesPath, mount);
  if (!expectedHost || expectedHost !== hostPath) {
    throw new HermesRuntimeError(
      "Les chemins hôte et conteneur ne correspondent pas au bind mount Hermes détecté.",
      400,
      "SSH_WORKSPACE_MAPPING_INVALID",
    );
  }
}

export async function alignTerminalCwd(
  channel: SshChannel,
  inspection: WorkspaceInspection,
  remoteHermesWorkdir: string,
  user: string,
) {
  const previous = inspection.terminalCwd ?? ".";
  const { setCommand, getCommand } = terminalCwdCommands(inspection, user);
  const result = await channel.exec(`${setCommand} ${shellQuote(remoteHermesWorkdir)}`);
  if (result.code !== 0) throw remoteCommandError(result);
  const verified = await channel.exec(getCommand);
  if (verified.code !== 0 || verified.stdout.trim().split(/\r?\n/).at(-1) !== remoteHermesWorkdir) {
    await restoreTerminalCwd(channel, inspection, previous, user, remoteCommandError(verified));
    throw new HermesRuntimeError(
      "Hermes n’a pas confirmé le nouveau terminal.cwd.",
      502,
      "SSH_HERMES_CWD_NOT_APPLIED",
    );
  }
  return (cause?: unknown) =>
    restoreTerminalCwd(channel, inspection, previous, user, cause);
}

export async function restoreTerminalCwd(
  channel: SshChannel,
  inspection: WorkspaceInspection,
  previous: string,
  user: string,
  cause?: unknown,
) {
  const { setCommand, getCommand } = terminalCwdCommands(inspection, user);
  const restored = await channel.exec(`${setCommand} ${shellQuote(previous)}`);
  const confirmed = restored.code === 0 ? await channel.exec(getCommand) : null;
  if (
    restored.code !== 0 ||
    !confirmed ||
    confirmed.code !== 0 ||
    confirmed.stdout.trim().split(/\r?\n/).at(-1) !== previous
  ) {
    const detail = restored.code !== 0 ? remoteResultDetail(restored) : remoteResultDetail(confirmed!);
    const error = new HermesRuntimeError(
      `terminal.cwd n’a pas pu être restauré à ${previous} : ${detail}`,
      500,
      "SSH_HERMES_CWD_ROLLBACK_FAILED",
    ) as HermesRuntimeError & { cause?: unknown };
    error.cause = cause;
    throw error;
  }
}

export async function withTerminalCwdRollback<T>(
  operation: () => Promise<T>,
  rollback: ((cause?: unknown) => Promise<void>) | null,
) {
  try {
    return await operation();
  } catch (error) {
    if (rollback) await rollback(error);
    throw error;
  }
}

export async function probeHermesWorkspaceAccess(
  channel: SshChannel,
  inspection: WorkspaceInspection,
  remoteHermesWorkdir: string,
  sshUser: string,
) {
  const marker = path.posix.join(
    remoteHermesWorkdir,
    `.hermes-runtime-probe-${randomUUID()}`,
  );
  const script = `set -eu; : > ${shellQuote(marker)}; rm -f -- ${shellQuote(marker)}`;
  let command: string;
  if (inspection.mode === "docker" && inspection.containerName) {
    const docker = sshUser === "root" ? "docker" : "sudo -n docker";
    command = `${docker} exec ${shellQuote(inspection.containerName)} sh -c ${shellQuote(script)}`;
  } else if (
    inspection.mode === "native" &&
    inspection.nativeServiceUser === sshUser
  ) {
    command = script;
  } else {
    throw new HermesRuntimeError(
      "Le contexte utilisateur du processus Hermes n’a pas pu être vérifié.",
      409,
      "SSH_HERMES_RUNTIME_CONTEXT_UNVERIFIED",
    );
  }
  const result = await channel.exec(command);
  if (result.code !== 0) {
    throw new HermesRuntimeError(
      `Hermes ne peut pas écrire dans le workspace sélectionné : ${remoteResultDetail(result)}`,
      409,
      "SSH_HERMES_WORKSPACE_NOT_WRITABLE",
    );
  }
}

function terminalCwdCommands(inspection: WorkspaceInspection, user: string) {
  const docker = user === "root" ? "docker" : "sudo -n docker";
  const prefix =
    inspection.mode === "docker" && inspection.containerName
      ? `${docker} exec ${shellQuote(inspection.containerName)}`
      : inspection.mode === "native" && inspection.nativeServiceUser === user
        ? ""
        : null;
  if (prefix === null) {
    throw new HermesRuntimeError(
      "Hermes doit être identifié avec son utilisateur de service avant de modifier terminal.cwd.",
      409,
      "SSH_HERMES_RUNTIME_CONTEXT_UNVERIFIED",
    );
  }
  return {
    setCommand: `${prefix ? `${prefix} ` : ""}hermes config set terminal.cwd`,
    getCommand: `${prefix ? `${prefix} ` : ""}hermes config get terminal.cwd`,
  };
}

async function verifySftpRoundTrip(channel: SshChannel, remoteWorkdir: string) {
  const localDir = await mkdtemp(path.join(tmpdir(), "hermes-console-sftp-"));
  const source = path.join(localDir, "source");
  const received = path.join(localDir, "received");
  const marker = randomUUID();
  const remote = path.posix.join(remoteWorkdir, `.hermes-console-probe-${marker}`);
  let failure: unknown = null;
  try {
    await writeFile(source, marker, { encoding: "utf8", mode: 0o600 });
    const sftp = await channel.sftp();
    const root = await sftp.stat(remoteWorkdir);
    if (root.type !== "directory") {
      throw new HermesRuntimeError(
        "Le chemin distant n’est pas un répertoire SFTP réel.",
        409,
        "SSH_WORKSPACE_INVALID_TYPE",
      );
    }
    await sftp.upload(source, remote);
    const uploaded = await sftp.stat(remote);
    if (uploaded.type !== "file" || uploaded.size !== Buffer.byteLength(marker)) {
      throw new Error("preuve SFTP distante invalide");
    }
    await sftp.download(remote, received, 1_024);
    if ((await readFile(received, "utf8")) !== marker) {
      throw new Error("contenu SFTP relu différent");
    }
  } catch (error) {
    failure = error;
  }
  const cleanup = await channel.exec(`rm -f -- ${shellQuote(remote)}`);
  try {
    await rm(localDir, { recursive: true, force: true });
  } finally {
    if (cleanup.code !== 0) {
      throw new HermesRuntimeError(
        "La preuve SFTP distante n’a pas pu être supprimée ; le workspace n’est pas activé.",
        502,
        "SSH_WORKSPACE_PROBE_CLEANUP_FAILED",
      );
    }
  }
  if (failure) throw failure;
}

function mapContainerPathToHost(
  containerPath: string,
  mount: NonNullable<WorkspaceInspection["dockerMount"]>,
) {
  const destination = path.posix.normalize(mount.destination);
  const normalized = path.posix.normalize(containerPath);
  if (normalized !== destination && !normalized.startsWith(`${destination}/`)) return null;
  const relative = path.posix.relative(destination, normalized);
  return relative ? path.posix.join(mount.source, relative) : mount.source;
}

function parseKeyValueOutput(output: string) {
  return Object.fromEntries(
    output
      .split(/\r?\n/)
      .map((line) => line.match(/^([a-z0-9_]+)=(.*)$/))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .map((match) => [match[1], match[2]]),
  ) as Record<string, string>;
}

function absoluteOrNull(value: string | undefined) {
  const candidate = value?.trim() ?? "";
  return candidate.startsWith("/") ? path.posix.normalize(candidate) : null;
}

function absoluteOrValue(value: string) {
  return value.trim();
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function remoteCommandError(result: { stdout: string; stderr: string }) {
  return new HermesRuntimeError(
    remoteResultDetail(result),
    502,
    "SSH_REMOTE_COMMAND_FAILED",
  );
}

function remoteResultDetail(result: { stdout: string; stderr: string }) {
  return (result.stderr || result.stdout || "commande distante échouée")
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-3)
    .join(" ");
}
