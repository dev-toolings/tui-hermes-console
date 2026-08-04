import { createHmac } from "node:crypto";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import {
  runtimeConfig,
  consoleSetup,
  type RuntimeHealthStatus,
  type RuntimeSshAuth,
  type RuntimeTransport,
  type RuntimeWorkspaceStatus,
} from "@/db/schema";
import { decryptSecret, encryptSecret, hasEncryptionKey } from "@/lib/crypto";
import {
  HermesRuntimeError,
  testHermesRuntimeAgainst,
  type HermesCapabilities,
} from "./hermes-adapter";
import {
  closeChannel,
  ensureTunnel,
  getChannel,
  withEphemeralSshChannel,
  type SshTarget,
} from "./ssh";
import {
  withRuntimeMutationLease,
  type RuntimeMutationLease,
} from "@/modules/runs/active-runtime-guard";

const RUNTIME_ID = "default";

/** Racines éphémères interdites pour un workdir SSH censé survivre au redémarrage. */
const EPHEMERAL_REMOTE_WORKDIR_ROOTS = ["/tmp", "/var/tmp", "/run", "/dev/shm"] as const;

/**
 * Valide le workdir persistant fourni par l'opérateur pour le transport SSH.
 * La Console ne peut pas prouver le montage distant, mais elle refuse les
 * racines transitoires connues et n'invente jamais de chemin de repli.
 */
export function requireDurableRemoteWorkdir(value: string | null | undefined): string {
  const candidate = value?.trim() ?? "";
  if (!candidate) {
    throw new HermesRuntimeError(
      "Un workdir distant durable est requis en mode tunnel SSH.",
      400,
      "SSH_WORKDIR_REQUIRED",
    );
  }
  if (candidate.includes("\0")) {
    throw new HermesRuntimeError(
      "Le workdir distant contient un caractère interdit.",
      400,
      "SSH_WORKDIR_INVALID",
    );
  }

  const normalized = path.posix.normalize(candidate).replace(/\/+$/, "") || "/";
  if (!normalized.startsWith("/") || normalized === "/") {
    throw new HermesRuntimeError(
      "Le workdir distant doit être un répertoire absolu dédié.",
      400,
      "SSH_WORKDIR_INVALID",
    );
  }
  if (
    EPHEMERAL_REMOTE_WORKDIR_ROOTS.some(
      (root) => normalized === root || normalized.startsWith(`${root}/`),
    )
  ) {
    throw new HermesRuntimeError(
      "Le workdir distant ne peut pas se trouver dans une racine transitoire (/tmp, /var/tmp, /run ou /dev/shm).",
      400,
      "SSH_WORKDIR_NOT_DURABLE",
    );
  }
  return normalized;
}

export function assertWorkspaceStatusReady(status: RuntimeWorkspaceStatus) {
  if (status === "not_required" || status === "ready") return;
  throw new HermesRuntimeError(
    "La connexion SSH est valide, mais son dossier de travail doit être vérifié avant de lancer une mission.",
    409,
    "SSH_WORKSPACE_REQUIRED",
  );
}

/** Garde produit appelée avant toute création de thread/run/message. */
export async function assertRuntimeWorkspaceReady() {
  const row = await getRuntimeRow();
  if (!row || row.transport !== "ssh") return;
  assertWorkspaceStatusReady(row.workspaceStatus);
}

export type { RuntimePublicDto } from "@console/core/types/api";
import type { RuntimePublicDto } from "@console/core/types/api";

export type ResolvedRuntimeConfig = {
  /** URL réellement appelable depuis ce process — en SSH, l'entrée locale du tunnel. */
  baseUrl: string;
  /** URL telle que saisie : en SSH, celle vue depuis la machine distante. */
  remoteBaseUrl: string;
  token: string;
  transport: RuntimeTransport;
  source: "database" | "env";
};

/** Bloc SSH saisi dans l'UI. Mot de passe absent = conserver celui déjà enregistré. */
export type SshConnectionInput = {
  host: string;
  port?: number;
  user: string;
  auth?: RuntimeSshAuth;
  password?: string;
};

export type RuntimeConnectionInput = {
  baseUrl: string;
  token?: string;
  name?: string;
  transport?: "direct";
};

export type RuntimeSshConnectInput = {
  baseUrl: string;
  token?: string;
  name?: string;
  expectedRevision?: number | null;
  credentialMode?: "manual" | "import";
  managementMode?: "external" | "managed";
  credentialAdapter?: "native_systemd" | "docker" | "compose" | "manual" | "unknown";
  ssh: SshConnectionInput;
};

export type RuntimeConfigurationVersion =
  | `database:${number}`
  | `environment:${string}`;

export function databaseRuntimeConfigurationVersion(revision: number) {
  return `database:${revision}` as const;
}

export function databaseRevisionFromRuntimeVersion(
  version: RuntimeConfigurationVersion,
) {
  if (!version.startsWith("database:")) return null;
  const revision = Number(version.slice("database:".length));
  return Number.isSafeInteger(revision) && revision > 0 ? revision : null;
}

export function environmentRuntimeConfigurationVersion(
  baseUrl: string,
  token: string,
  serverSecret = process.env.APP_ENCRYPTION_KEY,
) {
  if (!serverSecret) {
    throw new HermesRuntimeError(
      "APP_ENCRYPTION_KEY manquant — impossible de produire une preuve runtime non rejouable hors ligne.",
      503,
      "APP_ENCRYPTION_KEY_MISSING",
    );
  }
  const fingerprint = createHmac("sha256", serverSecret)
    .update("hermes-console:runtime-configuration:v1\0", "utf8")
    .update(
      JSON.stringify({
        baseUrl: baseUrl.trim().replace(/\/+$/, ""),
        token: token.trim(),
      }),
    )
    .digest("hex");
  return `environment:${fingerprint}` as const;
}

export async function getRuntimeConfigurationVersion(): Promise<RuntimeConfigurationVersion | null> {
  const row = await getRuntimeRow();
  if (row) return databaseRuntimeConfigurationVersion(row.configRevision);
  const baseUrl = process.env.HERMES_BASE_URL?.trim().replace(/\/+$/, "");
  const token = process.env.HERMES_RUNTIME_TOKEN?.trim();
  if (!baseUrl || !token) return null;
  return environmentRuntimeConfigurationVersion(baseUrl, token);
}

export async function isRuntimeConfigurationVersionCurrent(
  version: RuntimeConfigurationVersion,
) {
  return (await getRuntimeConfigurationVersion()) === version;
}

export function attachInternalRuntimeConfigurationVersion<T extends object>(
  result: T,
  version: RuntimeConfigurationVersion | null,
): T & { configurationVersion: RuntimeConfigurationVersion | null } {
  Object.defineProperty(result, "configurationVersion", {
    value: version,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return result as T & {
    configurationVersion: RuntimeConfigurationVersion | null;
  };
}

export async function getRuntimePublic(): Promise<RuntimePublicDto> {
  const row = await getRuntimeRow();
  if (row) {
    return {
      configured: true,
      source: "database",
      transport: row.transport,
      baseUrl: row.baseUrl,
      name: row.name,
      tokenConfigured: true,
      managementMode: row.managementMode,
      credentialAdapter: row.credentialAdapter,
      lastCredentialRotatedAt: row.lastCredentialRotatedAt?.toISOString() ?? null,
      encryptionReady: hasEncryptionKey(),
      sshHost: row.sshHost,
      sshPort: row.sshPort,
      sshUser: row.sshUser,
      sshAuth: row.sshAuth,
      sshPasswordConfigured: Boolean(row.encryptedSshPassword),
      remoteWorkdir: row.remoteWorkdir,
      remoteHermesWorkdir: row.remoteHermesWorkdir,
      workspaceStatus: row.workspaceStatus,
      configRevision: row.configRevision,
      detectedVersion: row.detectedVersion,
      capabilities: row.capabilities,
      lastHealthStatus: row.lastHealthStatus,
      lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  const envUrl = process.env.HERMES_BASE_URL?.replace(/\/+$/, "") ?? null;
  const envToken = Boolean(process.env.HERMES_RUNTIME_TOKEN);
  const envDefaults = {
    transport: "direct" as const,
    managementMode: "external" as const,
    credentialAdapter: "manual" as const,
    lastCredentialRotatedAt: null,
    sshHost: null,
    sshPort: 22,
    sshUser: null,
    sshAuth: "agent" as const,
    sshPasswordConfigured: false,
    remoteWorkdir: null,
    remoteHermesWorkdir: null,
    workspaceStatus: "not_required" as const,
    configRevision: null,
  };

  if (envUrl && envToken) {
    return {
      configured: true,
      source: "env",
      ...envDefaults,
      baseUrl: envUrl,
      name: "Hermes (env)",
      tokenConfigured: true,
      encryptionReady: hasEncryptionKey(),
      detectedVersion: null,
      capabilities: null,
      lastHealthStatus: "unknown",
      lastCheckedAt: null,
      updatedAt: null,
    };
  }

  return {
    configured: false,
    source: "none",
    ...envDefaults,
    baseUrl: envUrl,
    name: null,
    tokenConfigured: envToken,
    encryptionReady: hasEncryptionKey(),
    detectedVersion: null,
    capabilities: null,
    lastHealthStatus: "unknown",
    lastCheckedAt: null,
    updatedAt: null,
  };
}

export async function resolveHermesRuntimeConfig(): Promise<ResolvedRuntimeConfig> {
  const row = await getRuntimeRow();
  if (row) {
    const remoteBaseUrl = normalizeBaseUrl(row.baseUrl);
    const token = decryptSecret(row.encryptedToken);
    if (row.transport === "ssh") {
      const endpoint = remoteEndpoint(remoteBaseUrl);
      const baseUrl = await ensureTunnel(sshTargetFromRow(row), endpoint.host, endpoint.port);
      return { baseUrl, remoteBaseUrl, token, transport: "ssh", source: "database" };
    }
    return { baseUrl: remoteBaseUrl, remoteBaseUrl, token, transport: "direct", source: "database" };
  }

  const baseUrl = normalizeBaseUrl(process.env.HERMES_BASE_URL ?? "http://127.0.0.1:8642");
  const token = process.env.HERMES_RUNTIME_TOKEN?.trim();
  if (!token) {
    throw new HermesRuntimeError(
      "Le runtime Hermes n’est pas configuré. Renseignez URL + token dans Paramètres → Runtime.",
      503,
      "HERMES_RUNTIME_TOKEN_MISSING",
    );
  }
  return { baseUrl, remoteBaseUrl: baseUrl, token, transport: "direct", source: "env" };
}

export async function saveRuntimeConfig(
  input: RuntimeConnectionInput,
  mutationLease?: RuntimeMutationLease,
): Promise<RuntimePublicDto> {
  return withRuntimeMutationLease(
    () => saveRuntimeConfigUnlocked(input),
    mutationLease,
  );
}

export async function deleteRuntimeConfig(
  mutationLease?: RuntimeMutationLease,
): Promise<RuntimePublicDto> {
  return withRuntimeMutationLease(
    async () => {
      const existing = await getRuntimeRow();
      if (!existing) {
        throw new HermesRuntimeError(
          "La configuration runtime est fournie par l’environnement et ne peut pas être supprimée depuis la webapp.",
          409,
          "RUNTIME_CONFIGURATION_ENVIRONMENT",
        );
      }

      await getDatabase()
        .delete(runtimeConfig)
        .where(eq(runtimeConfig.id, RUNTIME_ID));
      closeChannel();
      return getRuntimePublic();
    },
    mutationLease,
  );
}

async function saveRuntimeConfigUnlocked(
  input: RuntimeConnectionInput,
): Promise<RuntimePublicDto> {
  if (!hasEncryptionKey()) {
    throw new HermesRuntimeError(
      "APP_ENCRYPTION_KEY manquant côté serveur — impossible de stocker le token.",
      503,
      "APP_ENCRYPTION_KEY_MISSING",
    );
  }

  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const existing = await getRuntimeRow();

  const encryptedToken = input.token?.trim()
    ? encryptSecret(input.token.trim())
    : existing?.transport === "direct" &&
        normalizeBaseUrl(existing.baseUrl) === baseUrl
      ? existing.encryptedToken
      : undefined;
  if (!encryptedToken) {
    throw new HermesRuntimeError(
      "Un token d’accès est requis pour enregistrer la connexion.",
      400,
      "HERMES_TOKEN_REQUIRED",
    );
  }

  const now = new Date();
  const db = getDatabase();
  const values = {
    name: input.name?.trim() || existing?.name || "Hermes",
    baseUrl,
    encryptedToken,
    transport: "direct" as const,
    managementMode: "external" as const,
    credentialAdapter: "manual" as const,
    lastCredentialRotatedAt: existing?.lastCredentialRotatedAt ?? null,
    sshHost: null,
    sshPort: 22,
    sshUser: null,
    sshAuth: "agent" as const,
    encryptedSshPassword: null,
    remoteWorkdir: null,
    remoteHermesWorkdir: null,
    workspaceStatus: "not_required" as const,
    lastHealthStatus: "unknown" as const,
    lastCheckedAt: null,
    detectedVersion: null,
    capabilities: null,
    updatedAt: now,
  };

  await db.transaction(async (tx) => {
    if (existing) {
      await tx
        .update(runtimeConfig)
        .set({
          ...values,
          configRevision: sql`${runtimeConfig.configRevision} + 1`,
        })
        .where(eq(runtimeConfig.id, RUNTIME_ID));
    } else {
      await tx.insert(runtimeConfig).values({
        id: RUNTIME_ID,
        ...values,
        configRevision: 1,
        createdAt: now,
      });
    }
    await tx
      .update(consoleSetup)
      .set({
        step: "agent",
        completedAt: null,
        runtimeVerifiedAt: null,
        runtimeConfigVersion: null,
        updatedAt: now,
      })
      .where(eq(consoleSetup.step, "completed"));
  });

  // L'ancien canal reste vivant pour une mission déjà active. Le prochain
  // appel avec une autre identité ouvrira son propre canal au moment utile.
  return getRuntimePublic();
}

type SshIdentityRow = {
  transport: RuntimeTransport;
  baseUrl: string;
  sshHost: string | null;
  sshPort: number;
  sshUser: string | null;
  sshAuth: RuntimeSshAuth;
};

/** Les secrets ne peuvent être repris que pour leur destination exacte. */
export function sameSshConnectionIdentity(
  row: SshIdentityRow | null,
  input: RuntimeSshConnectInput,
) {
  if (!row || row.transport !== "ssh") return false;
  return (
    normalizeBaseUrl(row.baseUrl) === normalizeBaseUrl(input.baseUrl) &&
    row.sshHost === input.ssh.host.trim() &&
    row.sshPort === (input.ssh.port ?? 22) &&
    row.sshUser === input.ssh.user.trim() &&
    row.sshAuth === (input.ssh.auth ?? "agent")
  );
}

/**
 * Valide une nouvelle cible dans un canal éphémère, puis la persiste via CAS.
 * Le tunnel partagé des missions n'est donc jamais fermé par un clic « Tester ».
 */
export async function connectAndSaveSshRuntime(
  input: RuntimeSshConnectInput,
  mutationLease?: RuntimeMutationLease,
) {
  return withRuntimeMutationLease(
    () => connectAndSaveSshRuntimeUnlocked(input),
    mutationLease,
  );
}

async function connectAndSaveSshRuntimeUnlocked(input: RuntimeSshConnectInput) {
  if (!hasEncryptionKey()) {
    throw new HermesRuntimeError(
      "APP_ENCRYPTION_KEY manquant côté serveur — impossible de stocker les secrets.",
      503,
      "APP_ENCRYPTION_KEY_MISSING",
    );
  }

  const remoteBaseUrl = normalizeBaseUrl(input.baseUrl);
  const endpoint = remoteEndpoint(remoteBaseUrl);
  const existing = await getRuntimeRow();
  const observedRevision = existing?.configRevision ?? null;
  if (
    input.expectedRevision !== undefined &&
    input.expectedRevision !== observedRevision
  ) {
    throw runtimeConfigurationChanged();
  }

  const sameIdentity = sameSshConnectionIdentity(existing, input);
  const suppliedToken = input.token?.trim() || undefined;
  const storedToken =
    sameIdentity && existing ? decryptSecret(existing.encryptedToken) : "";
  const auth = input.ssh.auth ?? "agent";
  const suppliedPassword = input.ssh.password?.trim() || undefined;
  const storedPassword =
    sameIdentity && auth === "password" && existing?.encryptedSshPassword
      ? decryptSecret(existing.encryptedSshPassword)
      : undefined;
  const password = suppliedPassword || storedPassword;
  const target: SshTarget = {
    host: input.ssh.host.trim(),
    port: input.ssh.port ?? 22,
    user: input.ssh.user.trim(),
    auth,
    password,
  };
  const token =
    suppliedToken ||
    storedToken ||
    (input.credentialMode === "import" ? await importRemoteHermesToken(target) : "");
  if (!token) {
    throw new HermesRuntimeError(
      "Saisissez le token Hermes pour cette nouvelle cible.",
      400,
      "RUNTIME_TOKEN_REQUIRED",
    );
  }

  if (auth === "password" && !password) {
    throw new HermesRuntimeError(
      "Saisissez le mot de passe SSH pour cette nouvelle cible.",
      400,
      "SSH_PASSWORD_REQUIRED",
    );
  }

  const verified = await withEphemeralSshChannel(target, async (channel) => {
    const baseUrl = await channel.forward(endpoint.host, endpoint.port);
    return testHermesRuntimeAgainst({ baseUrl, token });
  });
  const version = healthVersion(verified.health);

  const now = new Date();
  const requestedName = input.name?.trim() || undefined;
  const configurationChanged =
    !sameIdentity ||
    (suppliedToken !== undefined && suppliedToken !== storedToken) ||
    (suppliedPassword !== undefined && suppliedPassword !== storedPassword) ||
    (requestedName !== undefined && requestedName !== existing?.name) ||
    (input.managementMode !== undefined &&
      input.managementMode !== existing?.managementMode) ||
    (input.credentialAdapter !== undefined &&
      input.credentialAdapter !== existing?.credentialAdapter);
  const workspaceStatus: RuntimeWorkspaceStatus = sameIdentity
    ? existing?.workspaceStatus ?? "required"
    : "required";
  const values = {
    name: requestedName || existing?.name || "Hermes",
    baseUrl: remoteBaseUrl,
    encryptedToken:
      sameIdentity && existing && token === storedToken
        ? existing.encryptedToken
        : encryptSecret(token),
    transport: "ssh" as const,
    sshHost: target.host,
    sshPort: target.port,
    sshUser: target.user,
    sshAuth: target.auth,
    encryptedSshPassword:
      target.auth !== "password" || !password
        ? null
        : sameIdentity &&
            existing?.encryptedSshPassword &&
            password === storedPassword
          ? existing.encryptedSshPassword
          : encryptSecret(password),
    managementMode: input.managementMode ?? ("external" as const),
    credentialAdapter: input.credentialAdapter ?? ("manual" as const),
    lastCredentialRotatedAt: existing?.lastCredentialRotatedAt ?? null,
    remoteWorkdir: sameIdentity ? existing?.remoteWorkdir ?? null : null,
    remoteHermesWorkdir: sameIdentity
      ? existing?.remoteHermesWorkdir ?? null
      : null,
    workspaceStatus,
    lastHealthStatus: "healthy" as const,
    lastCheckedAt: now,
    detectedVersion: version,
    capabilities: verified.capabilities as Record<string, unknown>,
    updatedAt: now,
  };

  await getDatabase().transaction(async (tx) => {
    if (observedRevision !== null) {
      const [updated] = await tx
        .update(runtimeConfig)
        .set({
          ...values,
          ...(configurationChanged
            ? { configRevision: observedRevision + 1 }
            : {}),
        })
        .where(
          and(
            eq(runtimeConfig.id, RUNTIME_ID),
            eq(runtimeConfig.configRevision, observedRevision),
          ),
        )
        .returning({ id: runtimeConfig.id });
      if (!updated) throw runtimeConfigurationChanged();
    } else {
      const [inserted] = await tx
        .insert(runtimeConfig)
        .values({
          id: RUNTIME_ID,
          ...values,
          configRevision: 1,
          createdAt: now,
        })
        .onConflictDoNothing({ target: runtimeConfig.id })
        .returning({ id: runtimeConfig.id });
      if (!inserted) throw runtimeConfigurationChanged();
    }
    if (configurationChanged) {
      await tx
        .update(consoleSetup)
        .set({
          step: "agent",
          completedAt: null,
          runtimeVerifiedAt: null,
          runtimeConfigVersion: null,
          updatedAt: now,
        })
        .where(eq(consoleSetup.step, "completed"));
    }
  });

  return {
    runtime: await getRuntimePublic(),
    health: verified.health,
    capabilities: verified.capabilities,
  };
}

export async function probeAndPersistRuntime(
  options?: Partial<RuntimeConnectionInput>,
): Promise<{
  ok: true;
  health: unknown;
  capabilities: HermesCapabilities;
  runtime: RuntimePublicDto;
  configurationVersion: RuntimeConfigurationVersion | null;
}> {
  const configurationVersion = options
    ? null
    : await getRuntimeConfigurationVersion();
  const resolved = await resolveProbeTarget(options);

  try {
    const result = await testHermesRuntimeAgainst(resolved);
    const version =
      typeof result.health === "object" &&
      result.health &&
      "version" in result.health &&
      typeof (result.health as { version?: unknown }).version === "string"
        ? (result.health as { version: string }).version
        : null;

    if (configurationVersion) {
      await persistProbeResult(
        {
          status: "healthy",
          version,
          capabilities: result.capabilities as Record<string, unknown>,
        },
        configurationVersion,
      );
      if (!(await isRuntimeConfigurationVersionCurrent(configurationVersion))) {
        throw new HermesRuntimeError(
          "La configuration Hermes a changé pendant le test. Relancez le probe.",
          409,
          "RUNTIME_CONFIGURATION_CHANGED",
        );
      }
    }

    return attachInternalRuntimeConfigurationVersion({
      ok: true,
      ...result,
      runtime: await getRuntimePublic(),
    }, configurationVersion);
  } catch (error) {
    const status: RuntimeHealthStatus =
      error instanceof HermesRuntimeError && error.status === 401 ? "unauthorized" : "unreachable";
    if (configurationVersion) {
      await persistProbeResult({ status }, configurationVersion).catch(
        () => undefined,
      );
    }
    throw error;
  }
}

/** Résout ce que « Tester » doit appeler, y compris pour une config pas encore enregistrée.
 *
 *  Règle de sécurité : un secret enregistré n'est réutilisé que pour la destination
 *  pour laquelle il a été enregistré. Sans cette règle, `POST /api/runtime/test`
 *  est un *confused deputy* — l'appelant fournit une cible arbitraire et la Console
 *  y expédie le token Hermes ou le mot de passe SSH qu'elle détient. La garde reste
 *  nécessaire même une fois l'authentification en place (§17) : une session valide
 *  n'autorise pas davantage ce détournement. */
async function resolveProbeTarget(
  options?: Partial<RuntimeConnectionInput>,
): Promise<{ baseUrl: string; token: string }> {
  if (!options?.baseUrl) return resolveHermesRuntimeConfig();

  const remoteBaseUrl = normalizeBaseUrl(options.baseUrl);
  const row = await getRuntimeRow();
  let token = options.token?.trim() ?? "";
  if (!token) {
    if (
      !row ||
      row.transport !== "direct" ||
      normalizeBaseUrl(row.baseUrl) !== remoteBaseUrl
    ) {
      throw new HermesRuntimeError(
        "Saisissez le token du runtime pour tester cette adresse.",
        400,
        "RUNTIME_TOKEN_REQUIRED",
      );
    }
    token = decryptSecret(row.encryptedToken);
  }

  return { baseUrl: remoteBaseUrl, token };
}

function sshTargetFromRow(row: {
  sshHost: string | null;
  sshPort: number;
  sshUser: string | null;
  sshAuth: RuntimeSshAuth;
  encryptedSshPassword: string | null;
}): SshTarget {
  if (!row.sshHost || !row.sshUser) {
    throw new HermesRuntimeError(
      "Configuration SSH incomplète (hôte ou utilisateur manquant).",
      400,
      "SSH_CONFIG_INCOMPLETE",
    );
  }
  return {
    host: row.sshHost,
    port: row.sshPort,
    user: row.sshUser,
    auth: row.sshAuth,
    password: row.encryptedSshPassword ? decryptSecret(row.encryptedSshPassword) : undefined,
  };
}

export type StoredSshRuntime = {
  target: SshTarget;
  remoteBaseUrl: string;
  token: string;
  configRevision: number;
  remoteWorkdir: string | null;
  remoteHermesWorkdir: string | null;
  workspaceStatus: RuntimeWorkspaceStatus;
  managementMode: "external" | "managed";
  credentialAdapter: "native_systemd" | "docker" | "compose" | "manual" | "unknown";
  lastCredentialRotatedAt: Date | null;
};

export async function getStoredSshRuntime(
  expectedRevision?: number,
): Promise<StoredSshRuntime> {
  const row = await getRuntimeRow();
  if (!row || row.transport !== "ssh") {
    throw new HermesRuntimeError(
      "Enregistrez et testez d’abord la connexion SSH.",
      409,
      "SSH_CONNECTION_REQUIRED",
    );
  }
  if (
    expectedRevision !== undefined &&
    expectedRevision !== row.configRevision
  ) {
    throw runtimeConfigurationChanged();
  }
  return {
    target: sshTargetFromRow(row),
    remoteBaseUrl: normalizeBaseUrl(row.baseUrl),
    token: decryptSecret(row.encryptedToken),
    configRevision: row.configRevision,
    remoteWorkdir: row.remoteWorkdir,
    remoteHermesWorkdir: row.remoteHermesWorkdir,
    workspaceStatus: row.workspaceStatus,
    managementMode: row.managementMode,
    credentialAdapter: row.credentialAdapter,
    lastCredentialRotatedAt: row.lastCredentialRotatedAt,
  };
}

export async function persistSshWorkspace(input: {
  remoteWorkdir: string;
  remoteHermesWorkdir: string;
  expectedRevision: number;
}) {
  const remoteWorkdir = requireDurableRemoteWorkdir(input.remoteWorkdir);
  const remoteHermesWorkdir = requireDurableRemoteWorkdir(
    input.remoteHermesWorkdir,
  );
  const [updated] = await getDatabase()
    .update(runtimeConfig)
    .set({
      remoteWorkdir,
      remoteHermesWorkdir,
      workspaceStatus: "ready",
      configRevision: input.expectedRevision + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(runtimeConfig.id, RUNTIME_ID),
        eq(runtimeConfig.transport, "ssh"),
        eq(runtimeConfig.configRevision, input.expectedRevision),
      ),
    )
    .returning({ id: runtimeConfig.id });
  if (!updated) throw runtimeConfigurationChanged();
  return getRuntimePublic();
}

/** Décompose l'URL distante en cible de forward. Le tunnel transporte du TCP brut :
 *  une URL https côté distant casserait le TLS (mauvais SNI, certificat 127.0.0.1). */
function remoteEndpoint(remoteBaseUrl: string): { host: string; port: number } {
  let url: URL;
  try {
    url = new URL(remoteBaseUrl);
  } catch {
    throw new HermesRuntimeError(
      `URL Hermes invalide : ${remoteBaseUrl}`,
      400,
      "HERMES_BASE_URL_INVALID",
    );
  }

  if (url.protocol !== "http:") {
    throw new HermesRuntimeError(
      "En mode tunnel SSH, l’URL Hermes distante doit être en http:// — le lien est déjà chiffré par SSH.",
      400,
      "SSH_REMOTE_URL_UNSUPPORTED",
    );
  }

  return { host: url.hostname, port: Number(url.port || 80) };
}

/** Canal SSH courant + racine de travail distante, pour la synchro des artefacts. */
export async function getRemoteWorkspace(): Promise<{
  channel: ReturnType<typeof getChannel>;
  hostRoot: string;
  hermesRoot: string;
} | null> {
  const row = await getRuntimeRow();
  if (!row || row.transport !== "ssh") return null;
  assertWorkspaceStatusReady(row.workspaceStatus);
  return {
    channel: getChannel(sshTargetFromRow(row)),
    hostRoot: requireDurableRemoteWorkdir(row.remoteWorkdir),
    hermesRoot: requireDurableRemoteWorkdir(row.remoteHermesWorkdir),
  };
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

async function importRemoteHermesToken(target: SshTarget) {
  const result = await withEphemeralSshChannel(target, (channel) =>
    channel.exec([
      "set -eu",
      "if docker inspect hermes-console-runtime >/dev/null 2>&1; then",
      "  docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' hermes-console-runtime | sed -n 's/^API_SERVER_KEY=//p' | head -1",
      "else",
      "  sed -n 's/^[[:space:]]*API_SERVER_KEY[[:space:]]*=[[:space:]]*//p' \"${HOME:-}/.hermes/.env\" | head -1 | tr -d '\"'",
      "fi",
    ].join("\n")),
  );
  const token = result.stdout.trim();
  if (
    result.code !== 0 ||
    !token ||
    token.length > 2_000 ||
    /[\u0000-\u001f\u007f]/.test(token)
  ) {
    throw new HermesRuntimeError(
      "Impossible d’importer automatiquement API_SERVER_KEY depuis cette cible. Saisissez le token Hermes manuellement.",
      400,
      "RUNTIME_TOKEN_IMPORT_FAILED",
    );
  }
  return token;
}

function healthVersion(health: unknown) {
  return typeof health === "object" &&
    health !== null &&
    "version" in health &&
    typeof (health as { version?: unknown }).version === "string"
    ? (health as { version: string }).version
    : null;
}

function runtimeConfigurationChanged() {
  return new HermesRuntimeError(
    "La configuration Hermes a changé pendant l’opération. Rechargez puis réessayez.",
    409,
    "RUNTIME_CONFIGURATION_CHANGED",
  );
}

async function persistProbeResult(input: {
  status: RuntimeHealthStatus;
  version?: string | null;
  capabilities?: Record<string, unknown> | null;
}, expectedVersion: RuntimeConfigurationVersion) {
  const existing = await getRuntimeRow();
  if (!existing) return;

  const expectedRevision = databaseRevisionFromRuntimeVersion(expectedVersion);
  if (expectedRevision === null) return;

  const [updated] = await getDatabase()
    .update(runtimeConfig)
    .set({
      lastHealthStatus: input.status,
      lastCheckedAt: new Date(),
      detectedVersion: input.version ?? existing.detectedVersion,
      capabilities: input.capabilities ?? existing.capabilities,
    })
    .where(
      and(
        eq(runtimeConfig.id, RUNTIME_ID),
        eq(runtimeConfig.configRevision, expectedRevision),
      ),
    )
    .returning({ id: runtimeConfig.id });
  if (!updated) {
    throw new HermesRuntimeError(
      "La configuration Hermes a changé pendant le test. Relancez le probe.",
      409,
      "RUNTIME_CONFIGURATION_CHANGED",
    );
  }
}

async function getRuntimeRow() {
  try {
    const [row] = await getDatabase()
      .select()
      .from(runtimeConfig)
      .where(eq(runtimeConfig.id, RUNTIME_ID))
      .limit(1);
    return row ?? null;
  } catch (error) {
    if (error instanceof Error && error.message === "DATABASE_URL_MISSING") return null;
    throw error;
  }
}
