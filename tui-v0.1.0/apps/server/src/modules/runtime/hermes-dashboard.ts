import { spawn } from "node:child_process";
import type {
  HermesDashboardDto,
  HermesDashboardLifecycleAction,
} from "@console/core/types/api";
import { getRuntimePublic, getStoredSshRuntime } from "./config";
import {
  hermesCliExecutable,
  runHermesCommand,
} from "./local-management";
import { HermesRuntimeError } from "./hermes-adapter";
import { withEphemeralSshChannel, type SshChannel } from "./ssh";

export const HERMES_DASHBOARD_PORT = 9119;
const DASHBOARD_TIMEOUT_MS = 2_000;
const DASHBOARD_START_TIMEOUT_MS = 45_000;

type DashboardManager = HermesDashboardDto["manager"];
type DashboardProbe = { running: boolean; version: string | null };

export async function getHermesDashboardStatus(): Promise<HermesDashboardDto> {
  const checkedAt = new Date().toISOString();
  const runtime = await getRuntimePublic();

  if (!runtime.configured) {
    return statusDto({
      status: "unsupported",
      manager: "unknown",
      transport: "local",
      reason: "Configurez d’abord un runtime Hermes.",
      checkedAt,
    });
  }

  if (runtime.transport === "ssh") {
    return inspectSshDashboard(checkedAt);
  }

  const dashboardBaseUrl = configuredDashboardBaseUrl();
  if (!isLocalRuntimeUrl(runtime.baseUrl) && !dashboardBaseUrl) {
    return statusDto({
      status: "unsupported",
      manager: "unknown",
      transport: "local",
      reason: "Le pilotage automatique est disponible pour un runtime local ou SSH.",
      checkedAt,
    });
  }

  return inspectLocalDashboard(checkedAt, dashboardBaseUrl);
}

export async function manageHermesDashboard(
  action: HermesDashboardLifecycleAction,
): Promise<HermesDashboardDto> {
  const runtime = await getRuntimePublic();
  if (!runtime.configured) {
    throw new HermesRuntimeError(
      "Configurez d’abord un runtime Hermes.",
      409,
      "HERMES_RUNTIME_NOT_CONFIGURED",
    );
  }

  if (runtime.transport === "ssh") {
    return manageSshDashboard(action);
  }

  if (!isLocalRuntimeUrl(runtime.baseUrl) && !configuredDashboardBaseUrl()) {
    throw new HermesRuntimeError(
      "Le pilotage automatique est disponible pour un runtime local ou SSH.",
      501,
      "HERMES_DASHBOARD_DIRECT_REMOTE_UNSUPPORTED",
    );
  }

  const manager = await detectLocalManager();
  await runManagedDashboardAction(manager, action);
  await waitForLocalDashboard();
  return inspectLocalDashboard(new Date().toISOString());
}

async function inspectLocalDashboard(
  checkedAt: string,
  configuredBaseUrl = configuredDashboardBaseUrl(),
) {
  const manager = await detectLocalManager();
  const probe = await probeHermesDashboard(configuredBaseUrl ?? "http://127.0.0.1:9119");
  return statusDto({
    status: probe.running ? "running" : manager === "unknown" ? "unsupported" : "stopped",
    manager,
    transport: "local",
    version: probe.version,
    reason: probe.running
      ? null
      : manager === "unknown"
        ? "Aucun gestionnaire Hermes Dashboard détecté sur cette machine."
        : "Le Dashboard Hermes n’écoute pas sur le port 9119.",
    checkedAt,
  });
}

async function inspectSshDashboard(checkedAt: string): Promise<HermesDashboardDto> {
  try {
    const stored = await getStoredSshRuntime();
    return withEphemeralSshChannel(stored.target, async (channel) => {
      const manager = parseManager((await channel.exec(remoteManagerInspectionCommand())).stdout);
      try {
        const baseUrl = await channel.forward("127.0.0.1", HERMES_DASHBOARD_PORT);
        const probe = await probeHermesDashboard(baseUrl);
        return statusDto({
          status: probe.running ? "running" : "stopped",
          manager,
          transport: "ssh",
          version: probe.version,
          reason: probe.running
            ? null
            : "Le Dashboard Hermes distant ne répond pas sur le port 9119.",
          checkedAt,
        });
      } catch (error) {
        return statusDto({
          status: manager === "unknown" ? "unsupported" : "stopped",
          manager,
          transport: "ssh",
          reason:
            error instanceof Error
              ? error.message
              : "Le Dashboard Hermes distant est inaccessible.",
          checkedAt,
        });
      }
    });
  } catch (error) {
    return statusDto({
      status: "unreachable",
      manager: "unknown",
      transport: "ssh",
      reason: error instanceof Error ? error.message : "Connexion SSH impossible.",
      checkedAt,
    });
  }
}

async function manageSshDashboard(action: HermesDashboardLifecycleAction) {
  const stored = await getStoredSshRuntime();
  return withEphemeralSshChannel(stored.target, async (channel) => {
    const inspection = parseRemoteDashboardInspection(
      (await channel.exec(remoteManagerInspectionCommand())).stdout,
    );
    let manager = inspection.manager;
    if (manager === "unknown") {
      throw new HermesRuntimeError(
        "Aucun gestionnaire persistant du Dashboard Hermes n’a été détecté sur la machine distante.",
        409,
        "HERMES_DASHBOARD_MANAGER_UNSUPPORTED",
      );
    }

    if (manager === "docker-s6" && !inspection.dashboardPublished) {
      await ensureRemoteDashboardCompanion(channel, stored.target.user === "root");
      manager = "docker";
    } else if (manager === "docker") {
      await ensureRemoteDashboardCompanion(channel, stored.target.user === "root");
    }

    await runRemoteDashboardAction(channel, manager, action, stored.target.user === "root");
    const baseUrl = await channel.forward("127.0.0.1", HERMES_DASHBOARD_PORT);
    await waitForDashboard(baseUrl);

    const probe = await probeHermesDashboard(baseUrl);
    return statusDto({
      status: probe.running ? "running" : "stopped",
      manager,
      transport: "ssh",
      version: probe.version,
      reason: probe.running ? null : "Le Dashboard Hermes n’a pas répondu après l’action.",
      checkedAt: new Date().toISOString(),
    });
  });
}

async function detectLocalManager(): Promise<DashboardManager> {
  if (await commandSucceeds("systemctl", ["--user", "cat", "hermes-dashboard.service"])) {
    return "systemd-user";
  }
  if (await commandSucceeds("systemctl", ["cat", "hermes-dashboard.service"])) {
    return "systemd-system";
  }
  if (await commandSucceeds("docker", ["inspect", "hermes-console-dashboard"])) {
    return "docker";
  }
  if (await commandSucceeds("s6-svstat", ["/run/service/dashboard"])) {
    return "s6";
  }
  if (await commandSucceeds(hermesCliExecutable(), ["--version"])) {
    return "cli";
  }
  return "unknown";
}

async function runManagedDashboardAction(
  manager: DashboardManager,
  action: HermesDashboardLifecycleAction,
) {
  const verb = action === "restart" ? "restart" : "start";
  if (manager === "systemd-user") {
    await runProcess("systemctl", ["--user", verb, "hermes-dashboard.service"]);
    return;
  }
  if (manager === "systemd-system") {
    await runProcess("systemctl", [verb, "hermes-dashboard.service"]);
    return;
  }
  if (manager === "docker") {
    await runProcess("docker", [verb, "hermes-console-dashboard"]);
    return;
  }
  if (manager === "s6") {
    await runProcess("s6-svc", [action === "restart" ? "-r" : "-u", "/run/service/dashboard"]);
    return;
  }
  if (manager === "cli") {
    if (action === "restart") {
      await runHermesCommand(["dashboard", "--stop"], { timeoutMs: 15_000 });
    }
    spawnDetachedDashboard();
    return;
  }
  throw new HermesRuntimeError(
    "Aucun gestionnaire persistant du Dashboard Hermes n’a été détecté.",
    409,
    "HERMES_DASHBOARD_MANAGER_UNSUPPORTED",
  );
}

async function runRemoteDashboardAction(
  channel: SshChannel,
  manager: DashboardManager,
  action: HermesDashboardLifecycleAction,
  isRoot: boolean,
) {
  const verb = action === "restart" ? "restart" : "start";
  const sudo = isRoot ? "" : "sudo -n ";
  const command =
    manager === "systemd-user"
      ? `systemctl --user ${verb} hermes-dashboard.service`
      : manager === "systemd-system"
        ? `${sudo}systemctl ${verb} hermes-dashboard.service`
        : manager === "docker"
          ? `${sudo}docker ${verb} hermes-console-dashboard`
          : manager === "docker-s6"
            ? `${sudo}docker exec hermes-console-runtime /command/s6-svc ${action === "restart" ? "-r" : "-u"} /run/service/dashboard`
            : manager === "s6"
              ? `s6-svc ${action === "restart" ? "-r" : "-u"} /run/service/dashboard`
              : `nohup hermes dashboard --no-open >/dev/null 2>&1 </dev/null &`;
  const result = await channel.exec(`set -eu; ${command}`);
  if (result.code !== 0) {
    throw new HermesRuntimeError(
      (result.stderr || result.stdout || "Le Dashboard Hermes n’a pas pu démarrer.").trim(),
      502,
      "HERMES_DASHBOARD_LIFECYCLE_FAILED",
    );
  }
}

function remoteManagerInspectionCommand() {
  return [
    "set +e",
    "if docker inspect hermes-console-dashboard >/dev/null 2>&1; then printf 'manager=docker\\n'",
    "if docker port hermes-console-dashboard 9119/tcp 2>/dev/null | grep -q '127.0.0.1:9119'; then printf 'dashboard_access=published\\n'; fi",
    "elif docker inspect hermes-console-runtime >/dev/null 2>&1 && docker exec hermes-console-runtime test -d /run/service/dashboard >/dev/null 2>&1; then printf 'manager=docker-s6\\n'; if docker port hermes-console-runtime 9119/tcp 2>/dev/null | grep -q '127.0.0.1:9119'; then printf 'dashboard_access=published\\n'; else printf 'dashboard_access=unpublished\\n'; fi",
    "elif systemctl --user cat hermes-dashboard.service >/dev/null 2>&1; then printf 'manager=systemd-user\\n'",
    "elif systemctl cat hermes-dashboard.service >/dev/null 2>&1; then printf 'manager=systemd-system\\n'",
    "elif command -v s6-svstat >/dev/null 2>&1 && s6-svstat /run/service/dashboard >/dev/null 2>&1; then printf 'manager=s6\\n'",
    "elif command -v hermes >/dev/null 2>&1; then printf 'manager=cli\\n'",
    "else printf 'manager=unknown\\n'; fi",
  ].join("; ");
}

function parseRemoteDashboardInspection(output: string) {
  return {
    manager: parseManager(output),
    dashboardPublished: output.includes("dashboard_access=published"),
  };
}

function parseManager(output: string): DashboardManager {
  const value = output.match(/(?:^|\n)manager=([^\n]+)/)?.[1];
  return value === "systemd-user" ||
    value === "systemd-system" ||
    value === "docker" ||
    value === "docker-s6" ||
    value === "s6" ||
    value === "cli"
    ? value
    : "unknown";
}

async function ensureRemoteDashboardCompanion(channel: SshChannel, isRoot: boolean) {
  const sudo = isRoot ? "" : "sudo -n ";
  const result = await channel.exec(
    [
      "set -eu",
      `if ${sudo}docker inspect hermes-console-dashboard >/dev/null 2>&1; then`,
      `  network_mode="$(${sudo}docker inspect -f '{{.HostConfig.NetworkMode}}' hermes-console-dashboard)"`,
      `  command_line="$(${sudo}docker inspect -f '{{json .Config.Cmd}}' hermes-console-dashboard)"`,
      `  if [ "$network_mode" != "host" ] || ! printf '%s' "$command_line" | grep -q '127.0.0.1'; then`,
      `    ${sudo}docker rm -f hermes-console-dashboard >/dev/null`,
      "  else",
      `    ${sudo}docker start hermes-console-dashboard >/dev/null 2>&1 || true`,
      "  fi",
      "fi",
      `if ! ${sudo}docker inspect hermes-console-dashboard >/dev/null 2>&1; then`,
      `  image="$(${sudo}docker inspect -f '{{.Config.Image}}' hermes-console-runtime)"`,
      `  ${sudo}docker run -d --name hermes-console-dashboard --restart unless-stopped --network host --volumes-from hermes-console-runtime:rw "$image" dashboard --host 127.0.0.1 --port 9119 --no-open >/dev/null`,
      "fi",
    ].join("\n"),
  );
  if (result.code !== 0) {
    throw new HermesRuntimeError(
      (result.stderr || result.stdout || "Le conteneur Dashboard compagnon n’a pas pu démarrer.").trim(),
      502,
      "HERMES_DASHBOARD_COMPANION_FAILED",
    );
  }
}

export async function probeHermesDashboard(baseUrl: string): Promise<DashboardProbe> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DASHBOARD_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/status`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (response.status === 401 || response.ok) {
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        // A 401 is still proof that a Dashboard is listening.
      }
      const version =
        body && typeof body === "object" && "version" in body && typeof body.version === "string"
          ? body.version
          : null;
      return { running: true, version };
    }
    return { running: false, version: null };
  } catch {
    return { running: false, version: null };
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForLocalDashboard() {
  await waitForDashboard(configuredDashboardBaseUrl() ?? "http://127.0.0.1:9119");
}

async function waitForDashboard(baseUrl: string) {
  const deadline = Date.now() + DASHBOARD_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const probe = await probeHermesDashboard(baseUrl);
    if (probe.running) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new HermesRuntimeError(
    "Le Dashboard Hermes n’est pas redevenu accessible sur le port 9119.",
    504,
    "HERMES_DASHBOARD_RECOVERY_TIMEOUT",
  );
}

function spawnDetachedDashboard() {
  const child = spawn(hermesCliExecutable(), ["dashboard", "--no-open"], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, NO_COLOR: "1" },
  });
  child.unref();
}

async function commandSucceeds(command: string, args: string[]) {
  try {
    await runProcess(command, args, 3_000);
    return true;
  } catch {
    return false;
  }
}

async function runProcess(command: string, args: string[], timeoutMs = 15_000) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NO_COLOR: "1" },
    });
    let stderr = "";
    let stdout = "";
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve();
    };
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish(new Error(`${command} a dépassé son délai.`));
    }, timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = `${stdout}${chunk.toString()}`.slice(-4_000);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-4_000);
    });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (code === 0) finish();
      else finish(new Error((stderr || stdout || `${command} a échoué.`).trim()));
    });
  });
}

function statusDto(input: {
  status: HermesDashboardDto["status"];
  manager: DashboardManager;
  transport: HermesDashboardDto["transport"];
  version?: string | null;
  reason: string | null;
  checkedAt: string;
}): HermesDashboardDto {
  const manageable = input.manager !== "unknown" && input.status !== "unsupported";
  return {
    status: input.status,
    manager: input.manager,
    transport: input.transport,
    port: HERMES_DASHBOARD_PORT,
    version: input.version ?? null,
    canStart: manageable && input.status !== "running",
    canRestart: manageable && input.status === "running",
    reason: input.reason,
    checkedAt: input.checkedAt,
  };
}

function isLocalRuntimeUrl(value: string | null) {
  if (!value) return false;
  try {
    return ["127.0.0.1", "localhost", "::1"].includes(new URL(value).hostname);
  } catch {
    return false;
  }
}

function configuredDashboardBaseUrl() {
  const value = process.env.HERMES_DASHBOARD_BASE_URL?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return value.replace(/\/+$/, "");
  } catch {
    return null;
  }
}
