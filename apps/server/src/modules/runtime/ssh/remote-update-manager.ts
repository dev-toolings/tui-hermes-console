import remoteUpdateManagerScript from "./remote-update-manager.sh" with { type: "text" };

export const REMOTE_UPDATE_MANAGER_PATH =
  "/usr/local/libexec/hermes-console-runtime-manager";
export const REMOTE_UPDATE_MANAGER_CONFIG =
  "/etc/hermes-console/runtime-manager.conf";
export const REMOTE_UPDATE_MANAGER_SUDOERS =
  "/etc/sudoers.d/hermes-console-runtime-manager";
export const REMOTE_UPDATE_MANAGER_SCRIPT = remoteUpdateManagerScript;

const DOCKER_CONTRACT = "g1-002-docker-v1";

type InstallOptions = {
  sudo: "" | "sudo -n";
  serviceUser: string;
  serviceUid: number;
  serviceGid: number;
  runtimeRoot: string;
  mode: "native" | "docker";
};

type ManagerCommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export type RemoteUpdateManagerResult = {
  status: "updated" | "unchanged" | "rolled_back" | "recovery_required" | "failed";
  mode: "native" | "docker" | null;
};

export function remoteUpdateManagerInspectCommand() {
  return `sudo -n ${REMOTE_UPDATE_MANAGER_PATH} inspect`;
}

export function remoteUpdateManagerUpdateCommand() {
  return `sudo -n ${REMOTE_UPDATE_MANAGER_PATH} update`;
}

export function parseRemoteUpdateManagerResult(
  result: ManagerCommandResult,
): RemoteUpdateManagerResult {
  const values = new Map<string, string>();
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.match(/^([a-z_]+)=(.*)$/);
    if (match) values.set(match[1], match[2]);
  }
  const rawMode = values.get("mode");
  const mode = rawMode === "native" || rawMode === "docker" ? rawMode : null;
  if (!mode) return { status: "failed", mode: null };
  if (result.code === 75 && values.get("rolled_back") === "true") {
    return { status: "rolled_back", mode };
  }
  if (result.code === 76 && values.get("recovery_required") === "true") {
    return { status: "recovery_required", mode };
  }
  if (result.code !== 0) return { status: "failed", mode };
  if (values.get("updated") === "true") return { status: "updated", mode };
  if (values.get("updated") === "false") return { status: "unchanged", mode };
  return { status: "failed", mode };
}

export function buildRemoteUpdateManagerInstallCommand(options: InstallOptions) {
  if (!/^[a-z_][a-z0-9_-]*[$]?$/i.test(options.serviceUser)) {
    throw new Error("Invalid service user for the remote update manager.");
  }
  if (!Number.isSafeInteger(options.serviceUid) || options.serviceUid <= 0) {
    throw new Error("Invalid service UID for the remote update manager.");
  }
  if (!Number.isSafeInteger(options.serviceGid) || options.serviceGid <= 0) {
    throw new Error("Invalid service GID for the remote update manager.");
  }
  const runtimeRoot = options.runtimeRoot.replace(/\/+$/, "");
  if (
    !runtimeRoot.startsWith("/") ||
    runtimeRoot === "" ||
    /\s/.test(runtimeRoot) ||
    runtimeRoot.includes("'") ||
    runtimeRoot.includes("..")
  ) {
    throw new Error("Invalid runtime root for the remote update manager.");
  }

  const sudo = options.sudo ? `${options.sudo} ` : "";
  const managerBase64 = Buffer.from(REMOTE_UPDATE_MANAGER_SCRIPT).toString("base64");
  const sudoers = `${options.serviceUser} ALL=(root) NOPASSWD: ${REMOTE_UPDATE_MANAGER_PATH} inspect, ${REMOTE_UPDATE_MANAGER_PATH} update`;
  const configLines = [
    `mode=${options.mode}`,
    `runtime_root=${runtimeRoot}`,
    `service_user=${options.serviceUser}`,
    `service_uid=${options.serviceUid}`,
    `service_gid=${options.serviceGid}`,
    `docker_contract=${DOCKER_CONTRACT}`,
    "docker_contract_label=hermes.console.contract",
    "docker_container=hermes-console-runtime",
    "docker_source=nousresearch/hermes-agent:latest",
  ];

  return [
    "set -eu",
    `MANAGER_B64='${managerBase64}'`,
    "MANAGER_TMP=$(mktemp)",
    "CONFIG_TMP=$(mktemp)",
    "SUDOERS_TMP=$(mktemp)",
    `trap 'rm -f -- "$MANAGER_TMP" "$CONFIG_TMP" "$SUDOERS_TMP"' EXIT`,
    `printf '%s' "$MANAGER_B64" | base64 -d > "$MANAGER_TMP"`,
    `printf '%s\\n' ${configLines.map(shellQuote).join(" ")} > "$CONFIG_TMP"`,
    `printf '%s\\n' ${shellQuote(sudoers)} > "$SUDOERS_TMP"`,
    `${sudo}visudo -cf "$SUDOERS_TMP" >/dev/null`,
    `${sudo}install -d -o 0 -g 0 -m 0755 -- /usr/local/libexec /etc/hermes-console`,
    `${sudo}install -o 0 -g 0 -m 0755 -- "$MANAGER_TMP" ${REMOTE_UPDATE_MANAGER_PATH}`,
    `${sudo}install -o 0 -g 0 -m 0600 -- "$CONFIG_TMP" ${REMOTE_UPDATE_MANAGER_CONFIG}`,
    `${sudo}install -o 0 -g 0 -m 0440 -- "$SUDOERS_TMP" ${REMOTE_UPDATE_MANAGER_SUDOERS}`,
    `${sudo}visudo -cf ${REMOTE_UPDATE_MANAGER_SUDOERS} >/dev/null`,
  ].join("\n");
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}
