import { createHash, randomUUID } from "node:crypto";
import { withEphemeralSshChannel } from "./index";
import type { SshChannel, SshExecResult, SshTarget } from "./types";
import type {
  RuntimeProvisionMode,
  RuntimeSshInspectionDto,
  RuntimeSshPlanDto,
  RuntimeSshPlanStep,
  RuntimeSshProvisionJobDto,
} from "@console/core/types/api";
import {
  connectAndSaveSshRuntime,
  requireDurableRemoteWorkdir,
} from "../config";
import { activateSshWorkspace } from "./workspace";
import {
  withRuntimeMutationLease,
  type RuntimeMutationLease,
} from "@/modules/runs/active-runtime-guard";
import {
  HermesRuntimeError,
  testHermesRuntimeAgainst,
  type HermesCapabilities,
} from "../hermes-adapter";

export type RuntimeSshProvisionInput = {
  target: SshTarget;
  mode: RuntimeProvisionMode;
  remoteBaseUrl: string;
  remoteWorkdir: string;
  token?: string;
  /** Copie exacte de la cible affichée dans le plan, fournie au moment de l'exécution. */
  confirmation?: string;
};

export type ProvisionUpdate = (update: {
  step: string | null;
  progress: number;
  message: string;
}) => void;

export type ProvisionResult = {
  runtime: Awaited<ReturnType<typeof activateSshWorkspace>>["runtime"];
  health: unknown;
  capabilities: HermesCapabilities;
  token: string;
};

const DOCKER_NAME = "hermes-console-runtime";
const DOCKER_IMAGE =
  "nousresearch/hermes-agent:v2026.7.30@sha256:b869e64d6496d4763d5e4fb675b5f504cb23b0e35ec9b790481a56118602b10f";

export function validateRemoteBaseUrl(value: string) {
  const normalized = value.trim().replace(/\/+$/, "");
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error("URL Hermes distante invalide.");
  }
  if (url.protocol !== "http:") {
    throw new Error("En tunnel SSH, l’URL Hermes doit utiliser http://.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("L’URL Hermes distante ne doit contenir ni identifiants ni paramètres.");
  }
  return normalized;
}

export async function inspectSshTarget(
  target: SshTarget,
  remoteBaseUrl: string,
  remoteWorkdir: string,
): Promise<RuntimeSshInspectionDto> {
  const baseUrl = validateRemoteBaseUrl(remoteBaseUrl);
  const workdir = requireDurableRemoteWorkdir(remoteWorkdir);
  const result = await withEphemeralSshChannel(target, (channel) =>
    channel.exec(inspectionCommand(baseUrl, workdir, target.user)),
  );
  const values = parseKeyValueOutput(result.stdout);
  const stderr = `${result.stderr}\n${result.stdout}`;
  const knownHostStatus = /host key verification failed|remote host identification has changed/i.test(
    stderr,
  )
    ? "mismatch"
    : /no such host|could not resolve hostname|unknown host/i.test(stderr)
      ? "unknown"
      : result.code === 0
        ? "known"
        : "unavailable";

  const remoteReachable = result.code === 0 && values.remote_reachable === "yes";
  const warnings: string[] = [];
  if (knownHostStatus !== "known") warnings.push("La clé d’hôte SSH doit être validée avant le provisioning.");
  if (!remoteReachable) warnings.push("La session SSH n’a pas permis de terminer le diagnostic distant.");
  if (values.privilege === "missing" || values.privilege === "password_required") {
    warnings.push("Le compte SSH ne dispose pas d’un sudo non interactif exploitable.");
  }
  if (values.os_id && !["debian", "ubuntu"].includes(values.os_id)) {
    warnings.push("Le provisioning automatique est limité à Debian et Ubuntu.");
  }
  if (values.workdir === "missing") warnings.push("Le workdir distant sera créé pendant le provisioning.");
  if (values.hermes === "unreachable") warnings.push("Hermes n’est pas encore joignable sur l’URL distante.");

  return {
    target: { host: target.host, port: target.port, user: target.user },
    client: {
      sshAvailable: result.code !== 127,
      agentAvailable: target.auth === "agent" && Boolean(process.env.SSH_AUTH_SOCK),
      knownHostStatus,
      configAlias: target.host.includes(".") || /^\d+(\.\d+){3}$/.test(target.host) ? null : target.host,
    },
    remote: {
      reachable: remoteReachable,
      os: values.os_id || null,
      osVersion: values.os_version || null,
      architecture: values.architecture || null,
      sudo:
        values.privilege === "root"
          ? "root"
          : values.privilege === "available"
            ? "available"
            : values.privilege === "password_required"
              ? "password_required"
              : values.privilege === "missing"
                ? "missing"
                : "unknown",
      docker: values.docker === "available" ? "available" : values.docker === "missing" ? "missing" : "unknown",
      systemd: values.systemd === "available" ? "available" : values.systemd === "missing" ? "missing" : "unknown",
      hermes:
        values.hermes === "healthy"
          ? "healthy"
          : values.hermes === "missing"
            ? "missing"
            : values.hermes === "unreachable"
              ? "unreachable"
              : "unknown",
      hermesVersion: values.hermes_version || null,
      hermesMode: values.hermes_mode === "docker" ? "docker" : values.hermes_mode === "native" ? "native" : "unknown",
      port8642: values.port8642 === "listening" ? "listening" : values.port8642 === "closed" ? "closed" : "unknown",
      workdir:
        values.workdir === "ready"
          ? "ready"
          : values.workdir === "missing"
            ? "missing"
            : values.workdir === "not_writable"
              ? "not_writable"
              : "unknown",
    },
    warnings,
    checkedAt: new Date().toISOString(),
  };
}

export function buildSshProvisionPlan(
  input: RuntimeSshProvisionInput,
  inspection?: RuntimeSshInspectionDto,
): RuntimeSshPlanDto {
  const remoteBaseUrl = validateRemoteBaseUrl(input.remoteBaseUrl);
  const remoteWorkdir = requireDurableRemoteWorkdir(input.remoteWorkdir);
  const blockers: string[] = [];
  const warnings = [...(inspection?.warnings ?? [])];

  if (inspection?.client.knownHostStatus === "mismatch") blockers.push("La clé d’hôte SSH ne correspond pas à known_hosts.");
  if (inspection?.client.knownHostStatus === "unknown") blockers.push("La clé d’hôte SSH n’est pas validée dans known_hosts.");
  if (inspection?.client.knownHostStatus === "unavailable") blockers.push("La cible SSH n’a pas pu être vérifiée.");
  if (inspection && !inspection.remote.reachable) blockers.push("La session SSH distante est injoignable.");
  if (inspection?.remote.os && !["debian", "ubuntu"].includes(inspection.remote.os)) {
    blockers.push("Le provisioning automatique ne couvre que Debian et Ubuntu.");
  }
  if (inspection?.remote.sudo === "missing" || inspection?.remote.sudo === "password_required") {
    blockers.push("Un sudo non interactif est requis pour provisionner ce VPS.");
  }
  if (input.mode === "native" && inspection?.remote.systemd !== "available") {
    blockers.push("Le mode Hermes natif nécessite systemd sur le VPS.");
  }
  if (input.mode === "native") {
    blockers.push(
      "Le provisioning natif est désactivé tant qu’une release Hermes et son checksum officiel ne sont pas épinglés.",
    );
  }
  if (inspection?.remote.hermes === "healthy") {
    blockers.push("Une installation Hermes saine existe déjà : connectez-la avec le parcours SSH normal pour éviter de la remplacer.");
  }
  if (inspection?.remote.port8642 === "listening" && inspection.remote.hermes !== "healthy") {
    blockers.push("Le port 8642 est déjà occupé : arrêtez le service existant ou adoptez-le avant un nouveau déploiement.");
  }

  const steps: RuntimeSshPlanStep[] = [
    {
      id: "inspect",
      label: "Vérifier la cible SSH",
      description: "Contrôler le système, les privilèges, le port Hermes et le workdir.",
      commandPreview: "diagnostic SSH non destructif",
      destructive: false,
    },
    {
      id: "workdir",
      label: "Préparer le workdir distant",
      description: "Créer le répertoire durable avec les droits de l’utilisateur SSH.",
      commandPreview: `sudo install -d -o ${input.target.user} -g ${input.target.user} -m 0750 ${remoteWorkdir}`,
      destructive: false,
    },
  ];

  if (input.mode === "docker") {
    steps.push(
      {
        id: "docker",
        label: "Installer Docker si nécessaire",
        description: "Utiliser le paquet Debian/Ubuntu uniquement si Docker est absent.",
        commandPreview: "sudo apt-get update && sudo apt-get install -y docker.io",
        destructive: false,
      },
      {
        id: "hermes-docker",
        label: "Déployer Hermes Docker",
        description: "Lancer Hermes sur loopback :8642 avec redémarrage automatique.",
        commandPreview: `docker run --name ${DOCKER_NAME} -p 127.0.0.1:8642:8642 -v ${remoteWorkdir}:/opt/data ${DOCKER_IMAGE}`,
        destructive: Boolean(inspection?.remote.hermes === "healthy"),
      },
    );
  }

  if (input.mode === "native") {
    steps.push({
      id: "hermes-native",
      label: "Provisioning natif indisponible",
      description: "Une release et son checksum officiel doivent être épinglés avant activation de ce mode.",
      commandPreview: null,
      destructive: false,
    });
  }

  steps.push({
    id: "verify",
    label: "Vérifier Hermes",
    description: "Tester /health et /v1/capabilities à travers le tunnel SSH.",
    commandPreview: "GET /health + GET /v1/capabilities",
    destructive: false,
  });

  return {
    mode: input.mode,
    target: { host: input.target.host, port: input.target.port, user: input.target.user },
    remoteBaseUrl,
    remoteWorkdir,
    steps,
    blockers,
    warnings,
    confirmation: provisionConfirmation(input, remoteBaseUrl, remoteWorkdir),
  };
}

export async function provisionSshRuntime(
  input: RuntimeSshProvisionInput,
  update: ProvisionUpdate,
  mutationLease?: RuntimeMutationLease,
): Promise<ProvisionResult> {
  return withRuntimeMutationLease(
    (lease) => provisionSshRuntimeWithLease(input, update, lease),
    mutationLease,
  );
}

async function provisionSshRuntimeWithLease(
  input: RuntimeSshProvisionInput,
  update: ProvisionUpdate,
  mutationLease: RuntimeMutationLease,
) {
  if (input.mode === "native") {
    throw new HermesRuntimeError(
      "Le provisioning natif est désactivé faute de release Hermes avec checksum épinglé.",
      409,
      "SSH_NATIVE_PROVISION_UNPINNED",
    );
  }
  return withEphemeralSshChannel(input.target, (channel) =>
    provisionSshRuntimeOnChannel(input, update, channel, mutationLease),
  );
}

async function provisionSshRuntimeOnChannel(
  input: RuntimeSshProvisionInput,
  update: ProvisionUpdate,
  channel: SshChannel,
  mutationLease: RuntimeMutationLease,
): Promise<ProvisionResult> {
  const remoteBaseUrl = validateRemoteBaseUrl(input.remoteBaseUrl);
  const remoteWorkdir = requireDurableRemoteWorkdir(input.remoteWorkdir);
  let token = input.token?.trim() ?? "";
  let activatedHostWorkdir = remoteWorkdir;
  let activatedHermesWorkdir = remoteWorkdir;

  update({ step: "inspect", progress: 8, message: "Inspection SSH en cours…" });
  await runRemote(channel, inspectionCommand(remoteBaseUrl, remoteWorkdir, input.target.user));

  update({ step: "workdir", progress: 24, message: "Préparation du workdir distant…" });
  await runRemote(
    channel,
    `set -eu; ${sudoPrefix(input.target.user)} install -d -o ${shellQuote(input.target.user)} -g ${shellQuote(input.target.user)} -m 0750 -- ${shellQuote(remoteWorkdir)}`,
  );

  if (input.mode === "docker") {
    update({ step: "docker", progress: 40, message: "Vérification de Docker…" });
    await runRemote(
      channel,
      `set -eu; if ! ${sudoPrefix(input.target.user)} docker info >/dev/null 2>&1; then ${sudoPrefix(input.target.user)} apt-get update && ${sudoPrefix(input.target.user)} apt-get install -y docker.io; fi`,
    );
    const existingContainer = await channel.exec(
      `${sudoPrefix(input.target.user)} docker inspect ${shellQuote(DOCKER_NAME)} >/dev/null 2>&1`,
    );
    if (existingContainer.code === 0 && !token) {
      throw new Error("Un token Hermes explicite est requis pour réparer un conteneur existant.");
    }
    const tokenLine = token ? `TOKEN=${shellQuote(token)}` : "TOKEN=$(openssl rand -hex 32)";
    activatedHostWorkdir = `${remoteWorkdir.replace(/\/+$/, "")}/workspace`;
    activatedHermesWorkdir = "/opt/data/workspace";
    await runRemote(
      channel,
      `set -eu; ${sudoPrefix(input.target.user)} install -d -o ${shellQuote(input.target.user)} -g ${shellQuote(input.target.user)} -m 0750 -- ${shellQuote(activatedHostWorkdir)}`,
    );
    const dockerResult = await runRemote(
      channel,
      [
        "set -eu",
        tokenLine,
        `if ${sudoPrefix(input.target.user)} docker inspect ${shellQuote(DOCKER_NAME)} >/dev/null 2>&1; then`,
        `  ${sudoPrefix(input.target.user)} docker start ${shellQuote(DOCKER_NAME)} >/dev/null 2>&1 || true`,
        "else",
        `  ${sudoPrefix(input.target.user)} docker pull ${shellQuote(DOCKER_IMAGE)}`,
        `  ${sudoPrefix(input.target.user)} docker run -d --name ${shellQuote(DOCKER_NAME)} --restart unless-stopped --user "$(id -u):$(id -g)" -v ${shellQuote(`${remoteWorkdir}:/opt/data`)} -p 127.0.0.1:8642:8642 -e API_SERVER_ENABLED=true -e API_SERVER_HOST=0.0.0.0 -e API_SERVER_PORT=8642 -e API_SERVER_KEY="$TOKEN" ${shellQuote(DOCKER_IMAGE)} gateway run >/dev/null`,
        "fi",
        "printf 'hermes_token=%s\\n' \"$TOKEN\"",
      ].join("\n"),
    );
    token = parseMarker(dockerResult.stdout, "hermes_token") || token;
  }

  if (!token) throw new Error("Le token Hermes n’a pas pu être déterminé.");

  update({ step: "verify", progress: 82, message: "Vérification de l’API Hermes…" });
  const endpoint = new URL(remoteBaseUrl);
  const localBaseUrl = await channel.forward(endpoint.hostname, Number(endpoint.port || 80));
  const verified = await testHermesRuntimeAgainst({ baseUrl: localBaseUrl, token });
  update({ step: "verify", progress: 96, message: "Connexion runtime prête…" });
  const connected = await connectAndSaveSshRuntime({
    baseUrl: remoteBaseUrl,
    token,
    ssh: {
      host: input.target.host,
      port: input.target.port,
      user: input.target.user,
      auth: input.target.auth,
      password: input.target.password,
    },
  }, mutationLease);
  const revision = connected.runtime.configRevision;
  if (!revision) throw new Error("La révision runtime SSH est absente après connexion.");
  const { runtime } = await activateSshWorkspace({
    remoteWorkdir: activatedHostWorkdir,
    remoteHermesWorkdir: activatedHermesWorkdir,
    create: true,
    alignHermesCwd: true,
    expectedRevision: revision,
  }, mutationLease);
  update({ step: null, progress: 100, message: "Runtime Hermes distant connecté." });
  return { runtime, health: verified.health, capabilities: verified.capabilities, token };
}

async function runRemote(channel: SshChannel, command: string): Promise<SshExecResult> {
  const result = await channel.exec(command);
  if (result.code !== 0) {
    const detail = (result.stderr || result.stdout || "commande distante échouée")
      .replace(/API_SERVER_KEY\s*=\s*[^\s]+/gi, "API_SERVER_KEY=[redacted]")
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-3)
      .join(" ");
    throw new Error(detail);
  }
  return result;
}

function inspectionCommand(baseUrl: string, workdir: string, user: string) {
  const url = shellQuote(`${baseUrl}/health`);
  const sudo = sudoPrefix(user);
  return [
    "set +e",
    '[ -r /etc/os-release ] && . /etc/os-release',
    'printf "remote_reachable=yes\\n"',
    'printf "os_id=%s\\n" "${ID:-unknown}"',
    'printf "os_version=%s\\n" "${VERSION_ID:-unknown}"',
    'printf "architecture=%s\\n" "$(uname -m 2>/dev/null || printf unknown)"',
    'if [ "$(id -u)" = 0 ]; then privilege=root; elif sudo -n true >/dev/null 2>&1; then privilege=available; elif command -v sudo >/dev/null 2>&1; then privilege=password_required; else privilege=missing; fi',
    'printf "privilege=%s\\n" "$privilege"',
    `if ${sudo ? `${sudo} ` : ""}docker info >/dev/null 2>&1; then docker=available; else docker=missing; fi`,
    'printf "docker=%s\\n" "$docker"',
    'if command -v systemctl >/dev/null 2>&1; then systemd=available; else systemd=missing; fi',
    'printf "systemd=%s\\n" "$systemd"',
    `if curl --connect-timeout 2 --max-time 4 -fsS ${url} >/dev/null 2>&1; then hermes=healthy; else hermes=unreachable; fi`,
    'printf "hermes=%s\\n" "$hermes"',
    `if ${sudo ? `${sudo} ` : ""}docker inspect hermes-console-runtime >/dev/null 2>&1; then hermes_mode=docker; elif systemctl --user is-active --quiet hermes-gateway.service 2>/dev/null; then hermes_mode=native; else hermes_mode=unknown; fi`,
    'printf "hermes_mode=%s\\n" "$hermes_mode"',
    'if ss -lnt 2>/dev/null | grep -Eq ":8642[[:space:]]"; then port8642=listening; else port8642=closed; fi',
    'printf "port8642=%s\\n" "$port8642"',
    `if [ -d ${shellQuote(workdir)} ]; then if [ -w ${shellQuote(workdir)} ]; then workdir=ready; else workdir=not_writable; fi; else workdir=missing; fi`,
    'printf "workdir=%s\\n" "$workdir"',
  ].join("; ");
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

function parseMarker(output: string, key: string) {
  return parseKeyValueOutput(output)[key] ?? "";
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function sudoPrefix(user: string) {
  return user === "root" ? "" : "sudo -n";
}

export function createProvisionJob(
  mode: RuntimeProvisionMode,
): RuntimeSshProvisionJobDto {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    status: "queued",
    mode,
    step: null,
    progress: 0,
    message: "Provisioning en attente.",
    createdAt: now,
    updatedAt: now,
  };
}

function provisionConfirmation(
  input: RuntimeSshProvisionInput,
  remoteBaseUrl: string,
  remoteWorkdir: string,
) {
  const digest = createHash("sha256")
    .update(JSON.stringify({
      mode: input.mode,
      target: {
        host: input.target.host,
        port: input.target.port,
        user: input.target.user,
        auth: input.target.auth,
      },
      remoteBaseUrl,
      remoteWorkdir,
    }))
    .digest("hex")
    .slice(0, 12);
  return `${input.target.user}@${input.target.host}:${input.target.port}#${digest}`;
}
