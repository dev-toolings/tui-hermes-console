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
  testHermesRuntimeAgainst,
  type HermesCapabilities,
} from "../hermes-adapter";
import { buildRemoteUpdateManagerInstallCommand } from "./remote-update-manager";

export type RuntimeSshProvisionInput = {
  /** Compte d'administration éphémère : sudo/Docker, jamais persisté comme runtime. */
  provisioner: SshTarget;
  /** Compte de service non privilégié persisté pour tunnel, SFTP et missions. */
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
const DOCKER_CONTRACT = "g1-002-docker-v1";
const DOCKER_CHANNEL = "nousresearch/hermes-agent:latest";
const NATIVE_BRANCH = "main";
const NATIVE_ROOT = "/opt/hermes-console";
const NATIVE_INSTALLER_URL =
  `https://raw.githubusercontent.com/NousResearch/hermes-agent/${NATIVE_BRANCH}/scripts/install.sh`;

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
  if (values.dashboard !== "listening") {
    warnings.push("Le Dashboard Hermes n’est pas disponible sur le port 9119 et sera préparé si le mode Docker est utilisé.");
  }

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
      dashboard:
        values.dashboard === "listening"
          ? "listening"
          : values.dashboard === "closed"
            ? "closed"
            : "unknown",
      dashboardManager:
        values.dashboard_manager === "systemd-user" ||
        values.dashboard_manager === "systemd-system" ||
        values.dashboard_manager === "docker" ||
        values.dashboard_manager === "docker-s6" ||
        values.dashboard_manager === "s6" ||
        values.dashboard_manager === "cli"
          ? values.dashboard_manager
          : "unknown",
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

  if (input.provisioner.user === input.target.user) {
    blockers.push("Les identités SSH de provisioning et de service doivent être distinctes.");
  }
  if (input.provisioner.port !== input.target.port) {
    blockers.push("Les alias SSH admin et service doivent viser le même port distant.");
  }

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
  if (inspection?.remote.hermes === "healthy") {
    blockers.push("Une installation Hermes saine existe déjà : connectez-la avec le parcours SSH normal pour éviter de la remplacer.");
  }
  if (inspection?.remote.port8642 === "listening" && inspection.remote.hermes !== "healthy") {
    blockers.push("Le port 8642 est déjà occupé : arrêtez le service existant ou adoptez-le avant un nouveau déploiement.");
  }

  const steps: RuntimeSshPlanStep[] = [
    {
      id: "inspect",
      label: "Vérifier les identités SSH",
      description: "Contrôler l’admin sudo et le compte service non privilégié avant toute mutation.",
      commandPreview: "diagnostic SSH non destructif",
      destructive: false,
    },
    {
      id: "workdir",
      label: "Préparer le workdir distant",
      description: "Créer le répertoire durable avec les droits du compte service.",
      commandPreview: `sudo install -d -o ${input.target.user} -g <gid-service> -m 0750 ${remoteWorkdir}`,
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
        description: "Tirer le canal officiel latest, résoudre son digest, puis exécuter Hermes sous l’UID/GID du compte service.",
        commandPreview: `sudo docker pull ${DOCKER_CHANNEL} && sudo docker run --name ${DOCKER_NAME} --cap-drop ALL --cap-add CHOWN --cap-add DAC_OVERRIDE --cap-add FOWNER --cap-add SETGID --cap-add SETUID --security-opt no-new-privileges:true -e HERMES_UID=<uid-service> -e HERMES_GID=<gid-service> --mount type=bind,src=${remoteWorkdir},dst=/opt/data -p 127.0.0.1:8642:8642 <digest-résolu> gateway run`,
        destructive: Boolean(inspection?.remote.hermes === "healthy"),
      },
      {
        id: "dashboard",
        label: "Préparer le Dashboard Hermes",
        description: "Démarrer un service Dashboard persistant sur loopback :9119, sans remplacer Hermes API.",
        commandPreview: `sudo docker run --name hermes-console-dashboard --cap-drop ALL --cap-add CHOWN --cap-add DAC_OVERRIDE --cap-add FOWNER --cap-add SETGID --cap-add SETUID --security-opt no-new-privileges:true -e HERMES_UID=<uid-service> -e HERMES_GID=<gid-service> -p 127.0.0.1:9119:9119 --mount type=bind,src=${remoteWorkdir},dst=/opt/data <digest-résolu-de-latest> dashboard --host 0.0.0.0 --port 9119 --no-open`,
        destructive: false,
      },
    );
  }

  if (input.mode === "native") {
    steps.push(
      {
        id: "native-dependencies",
        label: "Installer les prérequis natifs",
        description: "Installer les dépendances OS sous l’identité admin avant de rendre la main au compte service.",
        commandPreview: "sudo apt-get install -y git curl xz-utils build-essential python3-dev libffi-dev ripgrep ffmpeg",
        destructive: false,
      },
      {
        id: "hermes-native",
        label: "Déployer Hermes system-wide",
        description: "Télécharger l’installateur officiel, suivre main, enregistrer le commit obtenu, sceller la release et activer systemd avec rollback.",
        commandPreview: `install --branch ${NATIVE_BRANCH} && record <commit-résolu> && systemctl enable --now hermes-gateway.service`,
        destructive: Boolean(inspection?.remote.hermes === "healthy"),
      },
    );
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
    provisioner: { host: input.provisioner.host, port: input.provisioner.port, user: input.provisioner.user },
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
  return withEphemeralSshChannel(input.provisioner, (channel) =>
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
  const sudo = sudoPrefix(input.provisioner.user);

  update({ step: "inspect", progress: 8, message: "Inspection SSH en cours…" });
  await runRemote(channel, inspectionCommand(remoteBaseUrl, remoteWorkdir, input.provisioner.user));
  const serviceIdentity = await verifySeparatedServiceIdentity(
    channel,
    input.provisioner,
    input.target,
  );

  update({ step: "workdir", progress: 24, message: "Préparation du workdir distant…" });
  await runRemote(
    channel,
    `set -eu; ${sudo} install -d -o ${serviceIdentity.uid} -g ${serviceIdentity.gid} -m 0750 -- ${shellQuote(remoteWorkdir)}`,
  );
  await runRemote(
    channel,
    buildRemoteUpdateManagerInstallCommand({
      sudo,
      serviceUser: input.target.user,
      serviceUid: serviceIdentity.uid,
      serviceGid: serviceIdentity.gid,
      runtimeRoot: remoteWorkdir,
      mode: input.mode,
    }),
  );

  if (input.mode === "docker") {
    update({ step: "docker", progress: 40, message: "Vérification de Docker…" });
    await runRemote(
      channel,
      `set -eu; if ! ${sudo} docker info >/dev/null 2>&1; then ${sudo} apt-get update && ${sudo} apt-get install -y docker.io; fi`,
    );
    activatedHostWorkdir = `${remoteWorkdir.replace(/\/+$/, "")}/workspace`;
    activatedHermesWorkdir = "/opt/data/workspace";
    await runRemote(
      channel,
      `set -eu; ${sudo} install -d -o ${serviceIdentity.uid} -g ${serviceIdentity.gid} -m 0750 -- ${shellQuote(activatedHostWorkdir)}`,
    );
    const dockerResult = await runRemote(
      channel,
      [
        "set -eu",
        `${sudo} docker pull ${shellQuote(DOCKER_CHANNEL)}`,
        `TARGET_IMAGE="$(${sudo} docker image inspect -f '{{index .RepoDigests 0}}' ${shellQuote(DOCKER_CHANNEL)})"`,
        `case "$TARGET_IMAGE" in nousresearch/hermes-agent@sha256:????????????????????????????????????????????????????????????????) ;; *) echo 'Le canal latest ne résout pas un digest Hermes valide.' >&2; exit 1 ;; esac`,
        `ENVFILE=${shellQuote(`${remoteWorkdir.replace(/\/+$/, "")}/runtime.env`)}`,
        token ? `TOKEN=${shellQuote(token)}` : `TOKEN="$(sed -n 's/^API_SERVER_KEY=//p' "$ENVFILE" 2>/dev/null | head -1 || true)"; [ -n "$TOKEN" ] || TOKEN="$(openssl rand -hex 32)"`,
        "TMP_ENV=$(mktemp)",
        `trap 'rm -f -- "$TMP_ENV"' EXIT`,
        `printf 'API_SERVER_ENABLED=true\\nAPI_SERVER_HOST=0.0.0.0\\nAPI_SERVER_PORT=8642\\nAPI_SERVER_KEY=%s\\n' "$TOKEN" > "$TMP_ENV"`,
        `${sudo} install -o ${serviceIdentity.uid} -g ${serviceIdentity.gid} -m 0600 -- "$TMP_ENV" "$ENVFILE"`,
        "RECREATE=true",
        `if ${sudo} docker inspect ${shellQuote(DOCKER_NAME)} >/dev/null 2>&1; then`,
        `  OWNERSHIP="$(${sudo} docker inspect -f '{{index .Config.Labels "hermes.console.managed"}}|{{index .Config.Labels "hermes.console.contract"}}' ${shellQuote(DOCKER_NAME)})"`,
        `  test "$OWNERSHIP" = ${shellQuote(`true|${DOCKER_CONTRACT}`)} || { echo 'Le conteneur Hermes homonyme n’appartient pas au contrat Console.' >&2; exit 1; }`,
        `  SHAPE="$(${sudo} docker inspect -f '{{.Config.Image}}|{{.Config.User}}|{{index .Config.Labels "hermes.console.contract"}}|{{index .Config.Labels "hermes.console.source"}}|{{index .Config.Labels "hermes.console.resolved"}}|{{index .Config.Labels "hermes.console.uid"}}|{{index .Config.Labels "hermes.console.gid"}}|{{range .Mounts}}{{if eq .Destination "/opt/data"}}{{.Source}}{{end}}{{end}}' ${shellQuote(DOCKER_NAME)})"`,
        `  EXPECTED="$TARGET_IMAGE|root|${DOCKER_CONTRACT}|${DOCKER_CHANNEL}|$TARGET_IMAGE|${serviceIdentity.uid}|${serviceIdentity.gid}|${remoteWorkdir}"`,
        `  if [ "$SHAPE" = "$EXPECTED" ]; then RECREATE=false; ${sudo} docker start ${shellQuote(DOCKER_NAME)} >/dev/null 2>&1 || true; else ${sudo} docker rm -f ${shellQuote(DOCKER_NAME)} >/dev/null; fi`,
        "fi",
        `if [ "$RECREATE" = true ]; then ${sudo} docker run -d --name ${shellQuote(DOCKER_NAME)} --label hermes.console.managed=true --label hermes.console.contract=${DOCKER_CONTRACT} --label hermes.console.source=${DOCKER_CHANNEL} --label hermes.console.resolved="$TARGET_IMAGE" --label hermes.console.uid=${serviceIdentity.uid} --label hermes.console.gid=${serviceIdentity.gid} --restart unless-stopped --cap-drop ALL --cap-add CHOWN --cap-add DAC_OVERRIDE --cap-add FOWNER --cap-add SETGID --cap-add SETUID --security-opt no-new-privileges:true --pids-limit 256 --cpus 1.5 --memory 6g --env HERMES_UID=${serviceIdentity.uid} --env HERMES_GID=${serviceIdentity.gid} --workdir /opt/data --tmpfs /tmp:size=512m,mode=1777 --tmpfs /var/tmp:size=256m,mode=1777 --tmpfs /run:rw,exec,nosuid,nodev,size=64m,mode=0755,uid=0,gid=0 --mount ${shellQuote(`type=bind,src=${remoteWorkdir},dst=/opt/data`)} -p 127.0.0.1:8642:8642 --env-file "$ENVFILE" "$TARGET_IMAGE" gateway run >/dev/null; fi`,
        "printf 'hermes_token=%s\\nhermes_image=%s\\n' \"$TOKEN\" \"$TARGET_IMAGE\"",
      ].join("\n"),
    );
    token = parseMarker(dockerResult.stdout, "hermes_token") || token;
    const resolvedImage = parseMarker(dockerResult.stdout, "hermes_image");
    if (!/^nousresearch\/hermes-agent@sha256:[a-f0-9]{64}$/.test(resolvedImage)) {
      throw new Error("Le digest Hermes résolu n’a pas pu être déterminé.");
    }

    update({ step: "dashboard", progress: 64, message: "Préparation du Dashboard Hermes…" });
    await ensureDockerDashboard(
      channel,
      input.provisioner.user,
      remoteWorkdir,
      serviceIdentity,
      resolvedImage,
    );
    await verifyRemoteDashboard(channel);
  }

  if (input.mode === "native") {
    update({ step: "native-dependencies", progress: 40, message: "Installation des prérequis natifs…" });
    await runRemote(
      channel,
      `set -eu; ${sudo} apt-get update; ${sudo} env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a apt-get install -y ca-certificates curl git xz-utils build-essential python3-dev libffi-dev ripgrep ffmpeg`,
    );
    update({ step: "hermes-native", progress: 58, message: "Installation du dernier Hermes depuis main…" });
    const nativeResult = await provisionNativeRuntime(
      channel,
      input.provisioner.user,
      input.target.user,
      serviceIdentity,
      remoteWorkdir,
      token,
    );
    token = parseMarker(nativeResult.stdout, "hermes_token") || token;
    activatedHostWorkdir = `${remoteWorkdir.replace(/\/+$/, "")}/workspace`;
    activatedHermesWorkdir = activatedHostWorkdir;
  }

  if (!token) throw new Error("Le token Hermes n’a pas pu être déterminé.");

  update({ step: "verify", progress: 82, message: "Vérification de l’API Hermes…" });
  const endpoint = new URL(remoteBaseUrl);
  const verified = await withEphemeralSshChannel(input.target, async (serviceChannel) => {
    const localBaseUrl = await serviceChannel.forward(
      endpoint.hostname,
      Number(endpoint.port || 80),
    );
    return testHermesRuntimeAgainst({ baseUrl: localBaseUrl, token });
  });
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
    managementMode: "managed",
    credentialAdapter: input.mode === "native" ? "native_systemd" : "docker",
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

type ServiceIdentity = {
  uid: number;
  gid: number;
  home: string;
  machineId: string;
};

export async function inspectSeparatedSshTargets(
  provisioner: SshTarget,
  service: SshTarget,
) {
  return withEphemeralSshChannel(provisioner, (channel) =>
    verifySeparatedServiceIdentity(channel, provisioner, service)
  );
}

async function verifySeparatedServiceIdentity(
  provisionerChannel: SshChannel,
  provisioner: SshTarget,
  service: SshTarget,
): Promise<ServiceIdentity> {
  if (provisioner.user === service.user) {
    throw new Error("Les comptes admin et service doivent être distincts.");
  }
  const adminResult = await runRemote(
    provisionerChannel,
    "set -eu; printf 'machine_id=%s\\n' \"$(cat /etc/machine-id)\"",
  );
  const serviceResult = await withEphemeralSshChannel(service, (channel) =>
    runRemote(
      channel,
      [
        "set -eu",
        "test \"$(id -u)\" -ne 0",
        "if sudo -n true >/dev/null 2>&1; then echo 'Le compte service possède sudo.' >&2; exit 31; fi",
        "if docker info >/dev/null 2>&1; then echo 'Le compte service accède à Docker.' >&2; exit 32; fi",
        "printf 'machine_id=%s\\n' \"$(cat /etc/machine-id)\"",
        "printf 'uid=%s\\n' \"$(id -u)\"",
        "printf 'gid=%s\\n' \"$(id -g)\"",
        "printf 'home=%s\\n' \"$HOME\"",
      ].join("; "),
    )
  );
  const admin = parseKeyValueOutput(adminResult.stdout);
  const observed = parseKeyValueOutput(serviceResult.stdout);
  if (!admin.machine_id || admin.machine_id !== observed.machine_id) {
    throw new Error("Les alias SSH admin et service ne désignent pas la même machine.");
  }
  const uid = Number(observed.uid);
  const gid = Number(observed.gid);
  if (!Number.isSafeInteger(uid) || uid <= 0 || !Number.isSafeInteger(gid) || gid <= 0) {
    throw new Error("L’UID/GID numérique du compte service est invalide.");
  }
  if (!observed.home?.startsWith("/") || /[\r\n]/.test(observed.home)) {
    throw new Error("Le HOME du compte service est invalide.");
  }
  return { uid, gid, home: observed.home, machineId: observed.machine_id };
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
    `if ${sudo ? `${sudo} ` : ""}docker inspect hermes-console-runtime >/dev/null 2>&1 && ${sudo ? `${sudo} ` : ""}docker inspect -f '{{.State.Running}}' hermes-console-runtime 2>/dev/null | grep -qx true; then hermes_mode=docker; elif systemctl --user is-active --quiet hermes-gateway.service 2>/dev/null || systemctl is-active --quiet hermes-gateway.service 2>/dev/null; then hermes_mode=native; else hermes_mode=unknown; fi`,
    'printf "hermes_mode=%s\\n" "$hermes_mode"',
    'if ss -lnt 2>/dev/null | grep -Eq ":8642[[:space:]]"; then port8642=listening; else port8642=closed; fi',
    'printf "port8642=%s\\n" "$port8642"',
    'if ss -lnt 2>/dev/null | grep -Eq ":9119[[:space:]]"; then dashboard=listening; else dashboard=closed; fi',
    'printf "dashboard=%s\\n" "$dashboard"',
    `if ${sudo ? `${sudo} ` : ""}docker inspect hermes-console-dashboard >/dev/null 2>&1; then dashboard_manager=docker; elif ${sudo ? `${sudo} ` : ""}docker inspect hermes-console-runtime >/dev/null 2>&1 && ${sudo ? `${sudo} ` : ""}docker exec hermes-console-runtime test -d /run/service/dashboard >/dev/null 2>&1; then dashboard_manager=docker-s6; elif systemctl --user cat hermes-dashboard.service >/dev/null 2>&1; then dashboard_manager=systemd-user; elif ${sudo ? `${sudo} ` : ""}systemctl cat hermes-dashboard.service >/dev/null 2>&1; then dashboard_manager=systemd-system; elif command -v s6-svstat >/dev/null 2>&1 && s6-svstat /run/service/dashboard >/dev/null 2>&1; then dashboard_manager=s6; elif command -v hermes >/dev/null 2>&1; then dashboard_manager=cli; else dashboard_manager=unknown; fi`,
    'printf "dashboard_manager=%s\\n" "$dashboard_manager"',
    `if [ -d ${shellQuote(workdir)} ]; then if [ -w ${shellQuote(workdir)} ]; then workdir=ready; else workdir=not_writable; fi; else workdir=missing; fi`,
    'printf "workdir=%s\\n" "$workdir"',
  ].join("; ");
}

export async function provisionNativeRuntime(
  channel: SshChannel,
  provisionerUser: string,
  serviceUser: string,
  serviceIdentity: ServiceIdentity,
  remoteWorkdir: string,
  requestedToken: string,
) {
  const sudo = sudoPrefix(provisionerUser);
  const installerPath = "/var/tmp/hermes-console-install-main.sh";
  const envFile = `${remoteWorkdir.replace(/\/+$/, "")}/runtime.env`;
  const workspace = `${remoteWorkdir.replace(/\/+$/, "")}/workspace`;
  const runAsService = provisionerUser === "root"
    ? `runuser -u ${shellQuote(serviceUser)} -- env HOME=${shellQuote(serviceIdentity.home)} HERMES_HOME=${shellQuote(remoteWorkdir)}`
    : `${sudo} -u ${shellQuote(serviceUser)} -H env HOME=${shellQuote(serviceIdentity.home)} HERMES_HOME=${shellQuote(remoteWorkdir)}`;
  const unit = [
    "[Unit]",
    "Description=Hermes Agent gateway managed by Hermes Console",
    "After=network-online.target",
    "Wants=network-online.target",
    "",
    "[Service]",
    "Type=simple",
    `User=${serviceIdentity.uid}`,
    `Group=${serviceIdentity.gid}`,
    `WorkingDirectory=${JSON.stringify(workspace)}`,
    `Environment=${JSON.stringify(`HOME=${serviceIdentity.home}`)}`,
    `Environment=${JSON.stringify(`HERMES_HOME=${remoteWorkdir}`)}`,
    `Environment=${JSON.stringify(`PATH=${NATIVE_ROOT}/current/venv/bin:${remoteWorkdir}/node/bin:/usr/local/bin:/usr/bin:/bin`)}`,
    `EnvironmentFile=${JSON.stringify(envFile)}`,
    `ExecStart=${NATIVE_ROOT}/current/venv/bin/hermes gateway run --replace`,
    "Restart=on-failure",
    "RestartSec=3",
    "NoNewPrivileges=true",
    "PrivateTmp=true",
    "ProtectSystem=full",
    "ProtectKernelTunables=true",
    "ProtectKernelModules=true",
    "ProtectControlGroups=true",
    "RestrictSUIDSGID=true",
    "LockPersonality=true",
    "RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6",
    "",
    "[Install]",
    "WantedBy=multi-user.target",
    "",
  ].join("\n");
  const encodedUnit = Buffer.from(unit).toString("base64");
  const tokenAssignment = requestedToken
    ? `TOKEN=${shellQuote(requestedToken)}`
    : `TOKEN="$(sed -n 's/^API_SERVER_KEY=//p' ${shellQuote(envFile)} 2>/dev/null | head -1 || true)"; [ -n "$TOKEN" ] || TOKEN="$(openssl rand -hex 32)"`;

  return runRemote(
    channel,
    [
      "set -eu",
      `${sudo} install -d -o 0 -g 0 -m 0755 -- ${shellQuote(NATIVE_ROOT)}`,
      `${sudo} install -d -o ${serviceIdentity.uid} -g ${serviceIdentity.gid} -m 0755 -- ${shellQuote(`${NATIVE_ROOT}/releases`)}`,
      `${sudo} install -d -o ${serviceIdentity.uid} -g ${serviceIdentity.gid} -m 0700 -- ${shellQuote(remoteWorkdir)}`,
      `${sudo} install -d -o ${serviceIdentity.uid} -g ${serviceIdentity.gid} -m 0750 -- ${shellQuote(workspace)}`,
      "ENV_TMP= UNIT_TMP= NATIVE_RELEASE=",
      `INSTALLER_TMP="$(${sudo} mktemp)"`,
      `trap 'for f in "\${ENV_TMP:-}" "\${UNIT_TMP:-}"; do [ -z "$f" ] || rm -f -- "$f"; done; ${sudo} rm -f -- "$INSTALLER_TMP"' EXIT`,
      `${sudo} curl -fsSL --retry 3 -o "$INSTALLER_TMP" ${shellQuote(NATIVE_INSTALLER_URL)}`,
      `INSTALLER_SHA256="$(${sudo} sha256sum "$INSTALLER_TMP" | cut -d ' ' -f1)"`,
      `printf '%s' "$INSTALLER_SHA256" | grep -Eq '^[a-f0-9]{64}$' || { echo 'Hash installateur Hermes invalide.' >&2; exit 1; }`,
      `${sudo} install -o 0 -g 0 -m 0755 -- "$INSTALLER_TMP" ${shellQuote(installerPath)}`,
      `RESOLVED_COMMIT="$(${sudo} git ls-remote https://github.com/NousResearch/hermes-agent.git refs/heads/main | cut -f1)"`,
      `printf '%s' "$RESOLVED_COMMIT" | grep -Eq '^[a-f0-9]{40}$' || { echo 'Commit Hermes résolu invalide.' >&2; exit 1; }`,
      `NATIVE_RELEASE=${shellQuote(`${NATIVE_ROOT}/releases`)}"/$RESOLVED_COMMIT"`,
      `if [ -e "$NATIVE_RELEASE" ] && { [ ! -x "$NATIVE_RELEASE/venv/bin/hermes" ] || ! head -n 1 "$NATIVE_RELEASE/venv/bin/hermes" | grep -Fq "$NATIVE_RELEASE/"; }; then ${sudo} rm -rf -- "$NATIVE_RELEASE"; fi`,
      `if [ ! -e "$NATIVE_RELEASE" ]; then ${runAsService} bash ${shellQuote(installerPath)} --branch ${shellQuote(NATIVE_BRANCH)} --dir "$NATIVE_RELEASE" --hermes-home ${shellQuote(remoteWorkdir)} --skip-setup --skip-browser --non-interactive; fi`,
      `test "$(${sudo} git -c safe.directory="$NATIVE_RELEASE" -C "$NATIVE_RELEASE" rev-parse HEAD)" = "$RESOLVED_COMMIT"`,
      `${sudo} chown -R 0:0 -- "$NATIVE_RELEASE"`,
      tokenAssignment,
      "ENV_TMP=$(mktemp)",
      `printf 'API_SERVER_ENABLED=true\nAPI_SERVER_HOST=127.0.0.1\nAPI_SERVER_PORT=8642\nAPI_SERVER_KEY=%s\n' "$TOKEN" > "$ENV_TMP"`,
      `${sudo} install -o ${serviceIdentity.uid} -g ${serviceIdentity.gid} -m 0600 -- "$ENV_TMP" ${shellQuote(envFile)}`,
      "UNIT_TMP=$(mktemp)",
      `printf '%s' ${shellQuote(encodedUnit)} | base64 -d > "$UNIT_TMP"`,
      `${sudo} install -o 0 -g 0 -m 0644 -- "$UNIT_TMP" /etc/systemd/system/hermes-gateway.service`,
      `PREVIOUS="$(${sudo} readlink -f ${shellQuote(`${NATIVE_ROOT}/current`)} 2>/dev/null || true)"`,
      `${sudo} ln -sfn -- "$NATIVE_RELEASE" ${shellQuote(`${NATIVE_ROOT}/current`)}`,
      `${sudo} systemctl daemon-reload`,
      `${sudo} systemctl enable hermes-gateway.service >/dev/null`,
      `if ! ${sudo} systemctl restart hermes-gateway.service; then if [ -n "$PREVIOUS" ]; then ${sudo} ln -sfn -- "$PREVIOUS" ${shellQuote(`${NATIVE_ROOT}/current`)}; ${sudo} systemctl restart hermes-gateway.service || true; else ${sudo} rm -f -- ${shellQuote(`${NATIVE_ROOT}/current`)}; fi; exit 1; fi`,
      "READY=false",
      `i=0; while [ "$i" -lt 45 ]; do if curl --connect-timeout 2 --max-time 4 -fsS http://127.0.0.1:8642/health >/dev/null 2>&1; then READY=true; break; fi; i=$((i + 1)); sleep 2; done`,
      `if [ "$READY" != true ]; then ${sudo} systemctl stop hermes-gateway.service || true; if [ -n "$PREVIOUS" ]; then ${sudo} ln -sfn -- "$PREVIOUS" ${shellQuote(`${NATIVE_ROOT}/current`)}; ${sudo} systemctl restart hermes-gateway.service || true; else ${sudo} rm -f -- ${shellQuote(`${NATIVE_ROOT}/current`)}; fi; echo 'Le healthcheck natif a échoué; rollback exécuté.' >&2; exit 1; fi`,
      `MAIN_PID="$(${sudo} systemctl show -p MainPID --value hermes-gateway.service)"; test "$(ps -o euid= -p "$MAIN_PID" | tr -d ' ')" = ${shellQuote(String(serviceIdentity.uid))}`,
      `printf 'hermes_token=%s\nhermes_commit=%s\ninstaller_sha256=%s\n' "$TOKEN" "$RESOLVED_COMMIT" "$INSTALLER_SHA256"`,
    ].join("\n"),
  );
}

async function ensureDockerDashboard(
  channel: SshChannel,
  user: string,
  remoteWorkdir: string,
  serviceIdentity: Pick<ServiceIdentity, "uid" | "gid">,
  resolvedImage: string,
) {
  const sudo = sudoPrefix(user);
  const existingCompanion = await channel.exec(
    `${sudo ? `${sudo} ` : ""}docker inspect hermes-console-dashboard >/dev/null 2>&1`,
  );
  if (existingCompanion.code === 0) {
    const companionShape = await channel.exec(
      `${sudo ? `${sudo} ` : ""}docker inspect -f '{{index .Config.Labels "hermes.console.managed"}}|{{index .Config.Labels "hermes.console.contract"}}|{{.Config.Image}} {{.HostConfig.NetworkMode}} {{json .Config.Cmd}}' hermes-console-dashboard`,
    );
    const ownedPrefix = `true|${DOCKER_CONTRACT}|`;
    if (companionShape.code === 0 && !companionShape.stdout.startsWith(ownedPrefix)) {
      throw new Error("Le conteneur Dashboard homonyme n’appartient pas au contrat Console.");
    }
    if (
      companionShape.code !== 0 ||
      !companionShape.stdout.startsWith(`${ownedPrefix}${resolvedImage} `) ||
      !companionShape.stdout.includes("bridge") ||
      !companionShape.stdout.includes("0.0.0.0")
    ) {
      await runRemote(
        channel,
        `${sudo ? `${sudo} ` : ""}docker rm -f hermes-console-dashboard >/dev/null`,
      );
    } else {
      await runRemote(
        channel,
        `${sudo ? `${sudo} ` : ""}docker start hermes-console-dashboard >/dev/null 2>&1 || true`,
      );
      return;
    }
  }

  const existingRuntimeService = await channel.exec(
    `${sudo ? `${sudo} ` : ""}docker inspect hermes-console-runtime >/dev/null 2>&1 && ${sudo ? `${sudo} ` : ""}docker exec hermes-console-runtime test -d /run/service/dashboard >/dev/null 2>&1 && ${sudo ? `${sudo} ` : ""}docker port hermes-console-runtime 9119/tcp 2>/dev/null | grep -q '127.0.0.1:9119'`,
  );
  if (existingRuntimeService.code === 0) {
    await runRemote(
      channel,
      `${sudo ? `${sudo} ` : ""}docker exec hermes-console-runtime /command/s6-svc -u /run/service/dashboard`,
    );
    return;
  }

  await runRemote(
    channel,
    [
      "set -eu",
      `${sudo ? `${sudo} ` : ""}docker run -d --name hermes-console-dashboard --label hermes.console.managed=true --label hermes.console.contract=${DOCKER_CONTRACT} --restart unless-stopped --cap-drop ALL --cap-add CHOWN --cap-add DAC_OVERRIDE --cap-add FOWNER --cap-add SETGID --cap-add SETUID --security-opt no-new-privileges:true --pids-limit 128 --cpus 0.5 --memory 1g --env HERMES_UID=${serviceIdentity.uid} --env HERMES_GID=${serviceIdentity.gid} --workdir /opt/data --tmpfs /tmp:size=128m,mode=1777 --tmpfs /run:rw,exec,nosuid,nodev,size=32m,mode=0755,uid=0,gid=0 --mount ${shellQuote(`type=bind,src=${remoteWorkdir},dst=/opt/data`)} -p 127.0.0.1:9119:9119 ${shellQuote(resolvedImage)} dashboard --host 0.0.0.0 --port 9119 --no-open >/dev/null`,
    ].join("; "),
  );
}

async function verifyRemoteDashboard(channel: SshChannel) {
  const result = await channel.exec(
    "set -eu; if curl --connect-timeout 2 --max-time 8 -fsS http://127.0.0.1:9119/api/status >/dev/null 2>&1 || [ \"$(curl --connect-timeout 2 --max-time 8 -s -o /dev/null -w '%{http_code}' http://127.0.0.1:9119/api/status)\" = 401 ]; then exit 0; fi; echo 'Le Dashboard Hermes ne répond pas sur 127.0.0.1:9119.' >&2; exit 1",
  );
  if (result.code !== 0) {
    throw new Error((result.stderr || result.stdout || "Le Dashboard Hermes n’a pas démarré.").trim());
  }
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
      provisioner: {
        host: input.provisioner.host,
        port: input.provisioner.port,
        user: input.provisioner.user,
        auth: input.provisioner.auth,
      },
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
  return `${input.provisioner.user}=>${input.target.user}@${input.target.host}:${input.target.port}#${digest}`;
}
