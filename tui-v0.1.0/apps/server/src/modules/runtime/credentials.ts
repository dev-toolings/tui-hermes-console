import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type {
  RuntimeCredentialAdapter,
  RuntimeCredentialOperationDto,
  RuntimeCredentialPlanDto,
} from "@console/core/types/api";
import { getDatabase } from "@/db/client";
import {
  runtimeConfig,
  runtimeCredentialOperations,
} from "@/db/schema";
import { encryptSecret } from "@/lib/crypto";
import {
  getRuntimePublic,
  getStoredSshRuntime,
} from "./config";
import { HermesRuntimeError, testHermesRuntimeAgainst } from "./hermes-adapter";
import {
  withEphemeralSshChannel,
  targetFingerprint,
  type SshChannel,
} from "./ssh";
import { withRuntimeMutationLease } from "@/modules/runs/active-runtime-guard";

type CredentialOperation = "import" | "generate" | "rotate";
type OperationStatus = RuntimeCredentialOperationDto["status"];

class RemoteCredentialWriteError extends HermesRuntimeError {
  constructor(readonly backupRef: string | null, reason?: string) {
    super(
      reason
        ? `La configuration distante du token a échoué : ${reason}`
        : "La configuration distante du token a échoué.",
      502,
      "RUNTIME_CREDENTIAL_WRITE_FAILED",
    );
  }
}

type CredentialPlan = RuntimeCredentialPlanDto & {
  expectedRevision: number;
  expiresAt: number;
};

const PLAN_TTL_MS = 10 * 60_000;
const REMOTE_CREDENTIAL_COMMAND_TIMEOUT_MS = 60_000;
const plans = new Map<string, CredentialPlan>();

const globals = globalThis as typeof globalThis & {
  hermesConsoleCredentialPlans?: Map<string, CredentialPlan>;
};
const sharedPlans = (globals.hermesConsoleCredentialPlans ??= plans);

type RemoteCredentialInspection = {
  adapter: RuntimeCredentialAdapter;
  manager: "systemd-user" | "systemd-system" | "docker" | "unknown";
  service: string | null;
  configPresent: boolean;
  managed: boolean;
  tokenPresent: boolean;
};

async function execCredentialCommand(channel: SshChannel, command: string) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      channel.exec(command),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new HermesRuntimeError(
              "La commande credentials distante n’a pas terminé dans le délai imparti.",
              504,
              "RUNTIME_CREDENTIAL_REMOTE_TIMEOUT",
            ),
          );
        }, REMOTE_CREDENTIAL_COMMAND_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function planRuntimeCredentialOperation(input: {
  operation: CredentialOperation;
  expectedRevision?: number | null;
}): Promise<RuntimeCredentialPlanDto> {
  const stored = await getStoredSshRuntime(input.expectedRevision ?? undefined);
  const inspection = await withEphemeralSshChannel(stored.target, (channel) =>
    inspectRemoteCredentials(channel),
  );
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (input.operation === "import" && !inspection.tokenPresent) {
    blockers.push("Aucun API_SERVER_KEY lisible n’a été détecté sur la cible.");
  }
  if (!isSupportedAdapter(inspection.adapter)) {
    blockers.push("L’installation Hermes n’est pas reconnue par un adapter sécurisé.");
  }
  if (input.operation !== "import" && inspection.adapter === "docker" && !inspection.managed) {
    warnings.push(
      "Le conteneur Docker existant sera adopté par la Console avant la rotation (label hermes.console.managed=true).",
    );
  }
  if (
    input.operation !== "import" &&
    inspection.adapter === "native_systemd" &&
    (!inspection.configPresent || !inspection.service)
  ) {
    blockers.push(
      "Le fichier ~/.hermes/.env ou le service systemd Hermes est introuvable.",
    );
  }
  if (input.operation !== "import") {
    warnings.push("Hermes sera redémarré après la modification du token.");
    warnings.push("L’ancien token sera restauré automatiquement si le test échoue.");
  }

  const id = randomUUID();
  const confirmation = [
    "HERMES-CREDENTIAL",
    input.operation,
    inspection.adapter,
    stored.target.host,
    String(stored.configRevision),
  ].join(" ");
  const plan: CredentialPlan = {
    id,
    operation: input.operation,
    adapter: inspection.adapter,
    target: targetFingerprint(stored.target).replace(/\|[^|]*$/, ""),
    configRevision: stored.configRevision,
    expectedDowntime: input.operation !== "import",
    confirmation,
    blockers,
    warnings,
    expectedRevision: stored.configRevision,
    expiresAt: Date.now() + PLAN_TTL_MS,
  };
  sharedPlans.set(id, plan);
  prunePlans();
  return plan;
}

export async function applyRuntimeCredentialOperation(input: {
  planId: string;
  confirmation: string;
  expectedRevision: number;
}): Promise<{
  operation: RuntimeCredentialOperationDto;
  runtime: Awaited<ReturnType<typeof getRuntimePublic>>;
}> {
  const plan = sharedPlans.get(input.planId);
  if (!plan || plan.expiresAt < Date.now()) {
    throw new HermesRuntimeError(
      "Ce plan de credentials est introuvable ou expiré.",
      409,
      "RUNTIME_CREDENTIAL_PLAN_EXPIRED",
    );
  }
  if (plan.confirmation !== input.confirmation) {
    throw new HermesRuntimeError(
      "La confirmation ne correspond pas au plan affiché.",
      409,
      "RUNTIME_CREDENTIAL_CONFIRMATION_REQUIRED",
    );
  }
  if (plan.expectedRevision !== input.expectedRevision) {
    throw new HermesRuntimeError(
      "La configuration runtime a changé. Rechargez la page.",
      409,
      "RUNTIME_CONFIGURATION_CHANGED",
    );
  }
  if (plan.blockers.length > 0) {
    throw new HermesRuntimeError(
      plan.blockers.join(" "),
      409,
      "RUNTIME_CREDENTIAL_ADAPTER_BLOCKED",
    );
  }

  return withRuntimeMutationLease(() => applyUnlocked(plan));
}

export async function getRuntimeCredentialOperation(
  id: string,
): Promise<RuntimeCredentialOperationDto> {
  const [row] = await getDatabase()
    .select()
    .from(runtimeCredentialOperations)
    .where(eq(runtimeCredentialOperations.id, id))
    .limit(1);
  if (!row) {
    throw new HermesRuntimeError(
      "Opération credentials introuvable.",
      404,
      "RUNTIME_CREDENTIAL_OPERATION_NOT_FOUND",
    );
  }
  return operationDto(row);
}

async function applyUnlocked(plan: CredentialPlan) {
  const stored = await getStoredSshRuntime(plan.expectedRevision);
  const operationId = randomUUID();
  const confirmationHash = createHash("sha256").update(plan.confirmation).digest("hex");
  await getDatabase().insert(runtimeCredentialOperations).values({
    id: operationId,
    runtimeId: "default",
    operation: plan.operation,
    adapter: plan.adapter,
    status: "applying",
    phase: "remote_prepare",
    expectedRevision: plan.expectedRevision,
    confirmationHash,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  let backupRef: string | null = null;
  let candidateToken = "";
  let committed = false;
  try {
    const remote = await withEphemeralSshChannel(stored.target, async (channel) => {
      if (plan.operation === "import") {
        return { token: await readRemoteToken(channel, plan.adapter), backupRef: null };
      }
      return writeRemoteToken(channel, plan.adapter, operationId);
    });
    candidateToken = remote.token;
    backupRef = remote.backupRef;
    if (!candidateToken) throw new Error("REMOTE_TOKEN_EMPTY");

    const encryptedToken = encryptSecret(candidateToken);
    await updateOperation(operationId, {
      phase: "verifying",
      status: "verifying",
      candidateEncryptedToken: encryptedToken,
      remoteBackupRef: backupRef,
    });

    const endpoint = new URL(stored.remoteBaseUrl);
    const verified = await withEphemeralSshChannel(stored.target, async (channel) => {
      const baseUrl = await channel.forward(endpoint.hostname, Number(endpoint.port || 80));
      return testHermesRuntimeAgainst({ baseUrl, token: candidateToken });
    });

    const now = new Date();
    const [updated] = await getDatabase()
      .update(runtimeConfig)
      .set({
        encryptedToken,
        managementMode: plan.operation === "import" ? "external" : "managed",
        credentialAdapter: plan.adapter,
        lastCredentialRotatedAt:
          plan.operation === "import" ? stored.lastCredentialRotatedAt : now,
        configRevision: plan.expectedRevision + 1,
        lastHealthStatus: "healthy",
        lastCheckedAt: now,
        detectedVersion: healthVersion(verified.health),
        capabilities: verified.capabilities as Record<string, unknown>,
        updatedAt: now,
      })
      .where(
        and(
          eq(runtimeConfig.id, "default"),
          eq(runtimeConfig.configRevision, plan.expectedRevision),
        ),
      )
      .returning({ id: runtimeConfig.id });
    if (!updated) throw new HermesRuntimeError("La configuration runtime a changé.", 409, "RUNTIME_CONFIGURATION_CHANGED");

    committed = true;
    await updateOperation(operationId, {
      status: "succeeded",
      phase: "completed",
      candidateEncryptedToken: null,
      remoteBackupRef: backupRef,
      completedAt: now,
    });
    if (backupRef) {
      try {
        await cleanupRemoteBackup(stored.target, plan.adapter, backupRef);
        await updateOperation(operationId, { remoteBackupRef: null });
      } catch {
        // The new credential is already committed; retain the backup reference
        // for an operator-led cleanup/recovery pass.
      }
    }
    sharedPlans.delete(plan.id);
    return {
      operation: await getRuntimeCredentialOperation(operationId),
      runtime: await getRuntimePublic(),
    };
  } catch (error) {
    if (!backupRef && error instanceof RemoteCredentialWriteError) {
      backupRef = error.backupRef;
    }
    if (committed) {
      // Never roll back a remote runtime after its encrypted credential was
      // committed with a matching configuration revision.
      await updateOperation(operationId, {
        status: "succeeded",
        phase: "completed",
        candidateEncryptedToken: null,
        remoteBackupRef: backupRef,
        completedAt: new Date(),
      }).catch(() => undefined);
      throw error;
    }
    let rollbackOk = true;
    if (backupRef && plan.operation !== "import") {
      try {
        const storedForRollback = await getStoredSshRuntime().catch(() => stored);
        await withEphemeralSshChannel(storedForRollback.target, (channel) =>
          rollbackRemoteToken(channel, plan.adapter, backupRef!),
        );
      } catch {
        rollbackOk = false;
      }
    }
    const status: OperationStatus = rollbackOk ? "rolled_back" : "recovery_required";
    await updateOperation(operationId, {
      status,
      phase: rollbackOk ? "rolled_back" : "recovery_required",
      errorCode: error instanceof HermesRuntimeError ? error.code : "RUNTIME_CREDENTIAL_FAILED",
      errorMessage: sanitizeError(error),
      completedAt: rollbackOk ? new Date() : null,
    }).catch(() => undefined);
    throw error;
  }
}

async function inspectRemoteCredentials(channel: SshChannel): Promise<RemoteCredentialInspection> {
  const result = await execCredentialCommand(channel, [
    "set +e",
    "adapter=unknown",
    "manager=unknown",
    "service=",
    "config_present=no",
    "managed=no",
    "token_present=no",
    "if docker inspect hermes-console-runtime >/dev/null 2>&1; then",
    "  adapter=docker",
    "  [ \"$(docker inspect -f '{{index .Config.Labels \"hermes.console.managed\"}}' hermes-console-runtime 2>/dev/null)\" = true ] && managed=yes",
    "  docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' hermes-console-runtime 2>/dev/null | grep -q '^API_SERVER_KEY=' && token_present=yes",
    "else",
    "  config=\"${HOME:-}/.hermes/.env\"",
    "  [ -f \"$config\" ] && config_present=yes",
    "  if systemctl --user cat hermes-gateway.service >/dev/null 2>&1; then adapter=native_systemd; manager=systemd-user; service=hermes-gateway.service",
    "  elif systemctl cat hermes-gateway.service >/dev/null 2>&1; then adapter=native_systemd; manager=systemd-system; service=hermes-gateway.service",
    "  elif systemctl --user cat hermes.service >/dev/null 2>&1; then adapter=native_systemd; manager=systemd-user; service=hermes.service",
    "  elif systemctl cat hermes.service >/dev/null 2>&1; then adapter=native_systemd; manager=systemd-system; service=hermes.service",
    "  elif [ -f \"$config\" ]; then adapter=native_systemd",
    "  fi",
    "  [ \"$config_present\" = yes ] && grep -Eq '^[[:space:]]*API_SERVER_KEY[[:space:]]*=' \"$config\" && token_present=yes",
    "fi",
    "printf 'adapter=%s\\nmanager=%s\\nservice=%s\\nconfig_present=%s\\nmanaged=%s\\ntoken_present=%s\\n' \"$adapter\" \"$manager\" \"$service\" \"$config_present\" \"$managed\" \"$token_present\"",
  ].join("\n"));
  return parseRemoteCredentialInspection(result.stdout);
}

export function parseRemoteCredentialInspection(output: string): RemoteCredentialInspection {
  const value = (key: string) => output.match(new RegExp(`(?:^|\\n)${key}=([^\\n]*)`))?.[1] ?? "";
  const adapter = value("adapter");
  const manager = value("manager");
  return {
    adapter: adapter === "native_systemd" || adapter === "docker" || adapter === "compose" ? adapter : "unknown",
    manager: manager === "systemd-user" || manager === "systemd-system" || manager === "docker" ? manager : "unknown",
    service: value("service") || null,
    configPresent: value("config_present") === "yes",
    managed: value("managed") === "yes",
    tokenPresent: value("token_present") === "yes",
  };
}

async function readRemoteToken(channel: SshChannel, adapter: RuntimeCredentialAdapter) {
  const command = adapter === "docker"
    ? "docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' hermes-console-runtime | sed -n 's/^API_SERVER_KEY=//p' | head -1"
    : "sed -n 's/^[[:space:]]*API_SERVER_KEY[[:space:]]*=[[:space:]]*//p' \"${HOME:-}/.hermes/.env\" | head -1 | tr -d '\"'";
  const result = await execCredentialCommand(channel, `set -eu; ${command}`);
  if (result.code !== 0) throw new HermesRuntimeError("Le token Hermes distant est illisible.", 502, "RUNTIME_CREDENTIAL_IMPORT_FAILED");
  return validateRemoteToken(result.stdout.trim());
}

async function writeRemoteToken(
  channel: SshChannel,
  adapter: RuntimeCredentialAdapter,
  operationId: string,
) {
  if (adapter === "native_systemd") {
    const script = [
      "set -eu",
      "config=\"${HOME:-}/.hermes/.env\"",
      "test -f \"$config\"",
      `backup=\"$config.console-backup-${operationId}\"`,
      "cp -p -- \"$config\" \"$backup\"",
      "printf 'backup=%s\\n' \"$backup\"",
      "tmp=\"$config.console-tmp\"",
      "token=\"$(openssl rand -hex 32)\"",
      "awk -v token=\"$token\" 'BEGIN{found=0} /^[[:space:]]*API_SERVER_KEY[[:space:]]*=/ {if(!found){print \"API_SERVER_KEY=\" token; found=1}; next} {print} END{if(!found) print \"API_SERVER_KEY=\" token}' \"$config\" > \"$tmp\"",
      "chmod 600 \"$tmp\" && mv -f -- \"$tmp\" \"$config\"",
      "if systemctl --user cat hermes-gateway.service >/dev/null 2>&1; then systemctl --user restart hermes-gateway.service; elif systemctl cat hermes-gateway.service >/dev/null 2>&1; then systemctl restart hermes-gateway.service; elif systemctl --user cat hermes.service >/dev/null 2>&1; then systemctl --user restart hermes.service; elif systemctl cat hermes.service >/dev/null 2>&1; then systemctl restart hermes.service; else true; fi",
      "printf 'token=%s\\nbackup=%s\\n' \"$token\" \"$backup\"",
    ].join("\n");
    return parseRemoteWrite(await execCredentialCommand(channel, script));
  }
  if (adapter === "docker") {
    const script = [
      "set -eu",
      "container=hermes-console-runtime",
      "managed=\"$(docker inspect -f '{{index .Config.Labels \"hermes.console.managed\"}}' \"$container\")\"",
      "managed=\"${managed:-false}\"",
      "image=\"$(docker inspect -f '{{.Config.Image}}' \"$container\")\"",
      "data=\"$(docker inspect -f '{{range .Mounts}}{{if eq .Destination \"/opt/data\"}}{{.Source}}{{end}}{{end}}' \"$container\")\"",
      "user=\"$(docker inspect -f '{{.Config.User}}' \"$container\")\"",
      "network=\"$(docker inspect -f '{{.HostConfig.NetworkMode}}' \"$container\")\"",
      "test -n \"$data\"",
      "envfile=\"$data/runtime.env\"",
      "case \"$data\" in /*) ;; *) echo 'Docker data mount is not an absolute host path' >&2; exit 1 ;; esac",
      "backup=\"$envfile.console-backup-RUNTIME_OPERATION_ID\"",
      "if [ -f \"$envfile\" ]; then cp -p -- \"$envfile\" \"$backup\"; else docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' \"$container\" > \"$envfile.seed\"; chmod 600 \"$envfile.seed\"; mv -f -- \"$envfile.seed\" \"$envfile\"; cp -p -- \"$envfile\" \"$backup\"; fi",
      "meta=\"$backup.meta\"",
      "printf 'image=%s\\nuser=%s\\nnetwork=%s\\nmanaged=%s\\n' \"$image\" \"$user\" \"$network\" \"$managed\" > \"$meta.tmp\"",
      "chmod 600 \"$meta.tmp\" && mv -f -- \"$meta.tmp\" \"$meta\"",
      "printf 'backup=%s\\n' \"$backup\"",
      "token=\"$(openssl rand -hex 32)\"",
      "awk -v token=\"$token\" 'BEGIN{found=0} /^[[:space:]]*API_SERVER_KEY[[:space:]]*=/ {if(!found){print \"API_SERVER_KEY=\" token; found=1}; next} {print} END{if(!found) print \"API_SERVER_KEY=\" token}' \"$envfile\" > \"$envfile.tmp\"",
      "chmod 600 \"$envfile.tmp\" && mv -f -- \"$envfile.tmp\" \"$envfile\"",
      "if [ \"$managed\" != true ]; then docker update --label-add hermes.console.managed=true \"$container\" >/dev/null; fi",
      "docker rm -f \"$container\" >/dev/null",
      "if [ -n \"$user\" ]; then docker run -d --name \"$container\" --label hermes.console.managed=true --restart unless-stopped --network \"$network\" --user \"$user\" -v \"$data:/opt/data\" -p 127.0.0.1:8642:8642 --env-file \"$envfile\" \"$image\" gateway run >/dev/null; else docker run -d --name \"$container\" --label hermes.console.managed=true --restart unless-stopped --network \"$network\" -v \"$data:/opt/data\" -p 127.0.0.1:8642:8642 --env-file \"$envfile\" \"$image\" gateway run >/dev/null; fi",
      "printf 'token=%s\\nbackup=%s\\n' \"$token\" \"$backup\"",
    ].join("\n").replaceAll("RUNTIME_OPERATION_ID", operationId);
    return parseRemoteWrite(await execCredentialCommand(channel, script));
  }
  throw new HermesRuntimeError("Adapter credentials non supporté.", 409, "RUNTIME_CREDENTIAL_ADAPTER_UNSUPPORTED");
}

function parseRemoteWrite(result: { stdout: string; stderr: string; code: number }) {
  const backupRef = result.stdout.match(/(?:^|\n)backup=([^\n]*)/)?.[1]?.trim() || null;
  if (result.code !== 0) {
    throw new RemoteCredentialWriteError(backupRef, sanitizeRemoteCommandFailure(result.stderr));
  }
  const token = result.stdout.match(/(?:^|\n)token=([^\n]+)/)?.[1]?.trim() ?? "";
  return { token: validateRemoteToken(token, "RUNTIME_CREDENTIAL_WRITE_EMPTY"), backupRef };
}

function validateRemoteToken(
  value: string,
  errorCode: "RUNTIME_CREDENTIAL_IMPORT_EMPTY" | "RUNTIME_CREDENTIAL_WRITE_EMPTY" = "RUNTIME_CREDENTIAL_IMPORT_EMPTY",
) {
  if (!value || value.length > 2_000 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new HermesRuntimeError(
      "Le token Hermes distant est absent ou invalide.",
      409,
      errorCode,
    );
  }
  return value;
}

function isSupportedAdapter(adapter: RuntimeCredentialAdapter) {
  return adapter === "native_systemd" || adapter === "docker";
}

async function rollbackRemoteToken(channel: SshChannel, adapter: RuntimeCredentialAdapter, backupRef: string) {
  if (adapter === "native_systemd") {
    const result = await execCredentialCommand(channel, [
      "set -eu",
      `config=\"\${HOME:-}/.hermes/.env\"`,
      `test -f ${shellQuote(backupRef)}`,
      `cp -p -- ${shellQuote(backupRef)} \"$config\"`,
      "if systemctl --user cat hermes-gateway.service >/dev/null 2>&1; then systemctl --user restart hermes-gateway.service; elif systemctl cat hermes-gateway.service >/dev/null 2>&1; then systemctl restart hermes-gateway.service; elif systemctl --user cat hermes.service >/dev/null 2>&1; then systemctl --user restart hermes.service; elif systemctl cat hermes.service >/dev/null 2>&1; then systemctl restart hermes.service; fi",
    ].join("\n"));
    if (result.code !== 0) throw new Error("REMOTE_ROLLBACK_FAILED");
    return;
  }
  if (adapter === "docker") {
    const result = await execCredentialCommand(channel, [
      "set -eu",
      "container=hermes-console-runtime",
      `test -f ${shellQuote(backupRef)}`,
      `meta=${shellQuote(`${backupRef}.meta`)}`,
      "test -f \"$meta\"",
      `envfile=${shellQuote(backupRef.replace(/\.console-backup-[^/]+$/, ""))}`,
      "data=\"${envfile%/runtime.env}\"",
      "image=\"$(sed -n 's/^image=//p' \"$meta\" | head -1)\"",
      "user=\"$(sed -n 's/^user=//p' \"$meta\" | head -1)\"",
      "network=\"$(sed -n 's/^network=//p' \"$meta\" | head -1)\"",
      "managed=\"$(sed -n 's/^managed=//p' \"$meta\" | head -1)\"",
      "test -n \"$image\"",
      "test -n \"$network\"",
      `cp -p -- ${shellQuote(backupRef)} \"$envfile\"`,
      "docker rm -f \"$container\" >/dev/null",
      "if [ \"$managed\" = true ]; then label_arg='--label hermes.console.managed=true'; else label_arg=''; fi",
      "if [ -n \"$user\" ]; then docker run -d --name \"$container\" $label_arg --restart unless-stopped --network \"$network\" --user \"$user\" -v \"$data:/opt/data\" -p 127.0.0.1:8642:8642 --env-file \"$envfile\" \"$image\" gateway run >/dev/null; else docker run -d --name \"$container\" $label_arg --restart unless-stopped --network \"$network\" -v \"$data:/opt/data\" -p 127.0.0.1:8642:8642 --env-file \"$envfile\" \"$image\" gateway run >/dev/null; fi",
    ].join("\n"));
    if (result.code !== 0) throw new Error("REMOTE_ROLLBACK_FAILED");
    return;
  }
  throw new Error("REMOTE_ROLLBACK_UNSUPPORTED");
}

async function cleanupRemoteBackup(
  target: { host: string; port: number; user: string; auth: "agent" | "password"; password?: string },
  adapter: RuntimeCredentialAdapter,
  backupRef: string,
) {
  await withEphemeralSshChannel(target, async (channel) => {
    if (adapter === "native_systemd" || adapter === "docker") {
      const result = await execCredentialCommand(
        channel,
        `rm -f -- ${shellQuote(backupRef)} ${shellQuote(`${backupRef}.meta`)}`,
      );
      if (result.code !== 0) throw new Error("REMOTE_BACKUP_CLEANUP_FAILED");
    }
  });
}

async function updateOperation(
  id: string,
  values: Partial<{
    status: OperationStatus;
    phase: string;
    candidateEncryptedToken: string | null;
    remoteBackupRef: string | null;
    errorCode: string;
    errorMessage: string;
    completedAt: Date | null;
  }>,
) {
  await getDatabase()
    .update(runtimeCredentialOperations)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(runtimeCredentialOperations.id, id));
}

function operationDto(row: typeof runtimeCredentialOperations.$inferSelect): RuntimeCredentialOperationDto {
  return {
    id: row.id,
    operation: row.operation as CredentialOperation,
    adapter: row.adapter as RuntimeCredentialAdapter,
    status: row.status as OperationStatus,
    phase: row.phase,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

function prunePlans(now = Date.now()) {
  for (const [id, plan] of sharedPlans) {
    if (plan.expiresAt < now) sharedPlans.delete(id);
  }
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function healthVersion(value: unknown) {
  return typeof value === "object" && value !== null && "version" in value && typeof value.version === "string"
    ? value.version
    : null;
}

function sanitizeError(error: unknown) {
  return (error instanceof Error ? error.message : String(error))
    .replace(/API_SERVER_KEY\s*=\s*[^\s]+/gi, "API_SERVER_KEY=[redacted]")
    .replace(/token=[^\s]+/gi, "token=[redacted]")
    .slice(0, 500);
}

export function sanitizeRemoteCommandFailure(stderr: string) {
  const line = stderr
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)
    .at(-1);
  if (!line) return "la commande distante a échoué sans diagnostic";

  return line
    .replace(/([A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|KEY)[A-Z0-9_]*)\s*=\s*[^\s]+/gi, "$1=[redacted]")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]")
    .replace(/(token\s*[:=]\s*)[^\s]+/gi, "$1[redacted]")
    .replace(/(secret\s*[:=]\s*)[^\s]+/gi, "$1[redacted]")
    .replace(/(password\s*[:=]\s*)[^\s]+/gi, "$1[redacted]")
    .slice(0, 240);
}
