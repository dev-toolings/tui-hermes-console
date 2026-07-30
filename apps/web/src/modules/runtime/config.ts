import { eq } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import {
  runtimeConfig,
  type RuntimeHealthStatus,
  type RuntimeSshAuth,
  type RuntimeTransport,
} from "@/db/schema";
import { decryptSecret, encryptSecret, hasEncryptionKey } from "@/lib/crypto";
import {
  HermesRuntimeError,
  testHermesRuntimeAgainst,
  type HermesCapabilities,
} from "./hermes-adapter";
import { closeChannel, ensureTunnel, getChannel, type SshTarget } from "./ssh";

const RUNTIME_ID = "default";

/** Racine de travail par défaut côté machine distante. */
export const DEFAULT_REMOTE_WORKDIR = "/tmp/hermes-console-work";

export type RuntimePublicDto = {
  configured: boolean;
  source: "database" | "env" | "none";
  transport: RuntimeTransport;
  baseUrl: string | null;
  name: string | null;
  tokenConfigured: boolean;
  sshHost: string | null;
  sshPort: number;
  sshUser: string | null;
  sshAuth: RuntimeSshAuth;
  sshPasswordConfigured: boolean;
  remoteWorkdir: string | null;
  detectedVersion: string | null;
  capabilities: Record<string, unknown> | null;
  lastHealthStatus: RuntimeHealthStatus;
  lastCheckedAt: string | null;
  updatedAt: string | null;
};

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
  transport?: RuntimeTransport;
  ssh?: SshConnectionInput;
  remoteWorkdir?: string;
};

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
      sshHost: row.sshHost,
      sshPort: row.sshPort,
      sshUser: row.sshUser,
      sshAuth: row.sshAuth,
      sshPasswordConfigured: Boolean(row.encryptedSshPassword),
      remoteWorkdir: row.remoteWorkdir,
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
    sshHost: null,
    sshPort: 22,
    sshUser: null,
    sshAuth: "agent" as const,
    sshPasswordConfigured: false,
    remoteWorkdir: null,
  };

  if (envUrl && envToken) {
    return {
      configured: true,
      source: "env",
      ...envDefaults,
      baseUrl: envUrl,
      name: "Hermes (env)",
      tokenConfigured: true,
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

export async function saveRuntimeConfig(input: RuntimeConnectionInput): Promise<RuntimePublicDto> {
  if (!hasEncryptionKey()) {
    throw new HermesRuntimeError(
      "APP_ENCRYPTION_KEY manquant côté serveur — impossible de stocker le token.",
      503,
      "APP_ENCRYPTION_KEY_MISSING",
    );
  }

  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const transport = input.transport ?? "direct";
  const existing = await getRuntimeRow();

  let encryptedToken = existing?.encryptedToken;
  if (input.token?.trim()) encryptedToken = encryptSecret(input.token.trim());
  if (!encryptedToken) {
    throw new HermesRuntimeError(
      "Un token d’accès est requis pour enregistrer la connexion.",
      400,
      "HERMES_TOKEN_REQUIRED",
    );
  }

  let encryptedSshPassword = existing?.encryptedSshPassword ?? null;
  let sshHost = existing?.sshHost ?? null;
  let sshPort = existing?.sshPort ?? 22;
  let sshUser = existing?.sshUser ?? null;
  let sshAuth: RuntimeSshAuth = existing?.sshAuth ?? "agent";
  let remoteWorkdir = existing?.remoteWorkdir ?? null;

  if (transport === "ssh") {
    const ssh = input.ssh;
    if (!ssh?.host.trim() || !ssh.user.trim()) {
      throw new HermesRuntimeError(
        "Hôte et utilisateur SSH sont requis en mode tunnel.",
        400,
        "SSH_CONFIG_INCOMPLETE",
      );
    }
    sshHost = ssh.host.trim();
    sshPort = ssh.port ?? 22;
    sshUser = ssh.user.trim();
    sshAuth = ssh.auth ?? "agent";
    remoteWorkdir = input.remoteWorkdir?.trim() || remoteWorkdir || DEFAULT_REMOTE_WORKDIR;

    if (ssh.password?.trim()) encryptedSshPassword = encryptSecret(ssh.password.trim());
    if (sshAuth === "password" && !encryptedSshPassword) {
      throw new HermesRuntimeError(
        "Un mot de passe SSH est requis pour ce mode d’authentification.",
        400,
        "SSH_PASSWORD_REQUIRED",
      );
    }
    // Valide l'URL distante avant de persister (rejette https, cf. remoteEndpoint).
    remoteEndpoint(baseUrl);
  }

  const now = new Date();
  const db = getDatabase();
  const values = {
    name: input.name?.trim() || existing?.name || "Hermes",
    baseUrl,
    encryptedToken,
    transport,
    sshHost,
    sshPort,
    sshUser,
    sshAuth,
    encryptedSshPassword,
    remoteWorkdir,
    updatedAt: now,
  };

  if (existing) {
    await db.update(runtimeConfig).set(values).where(eq(runtimeConfig.id, RUNTIME_ID));
  } else {
    await db.insert(runtimeConfig).values({
      id: RUNTIME_ID,
      ...values,
      lastHealthStatus: "unknown",
      createdAt: now,
    });
  }

  // La cible a pu changer : le prochain appel rouvrira un canal à jour.
  closeChannel();
  return getRuntimePublic();
}

export async function probeAndPersistRuntime(
  options?: Partial<RuntimeConnectionInput>,
): Promise<{
  ok: true;
  health: unknown;
  capabilities: HermesCapabilities;
  runtime: RuntimePublicDto;
}> {
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

    await persistProbeResult({
      status: "healthy",
      version,
      capabilities: result.capabilities as Record<string, unknown>,
    });

    return { ok: true, ...result, runtime: await getRuntimePublic() };
  } catch (error) {
    const status: RuntimeHealthStatus =
      error instanceof HermesRuntimeError && error.status === 401 ? "unauthorized" : "unreachable";
    await persistProbeResult({ status });
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
  const transport = options.transport ?? "direct";

  let token = options.token?.trim() ?? "";
  if (!token) {
    if (!row || normalizeBaseUrl(row.baseUrl) !== remoteBaseUrl) {
      throw new HermesRuntimeError(
        "Saisissez le token du runtime pour tester cette adresse.",
        400,
        "RUNTIME_TOKEN_REQUIRED",
      );
    }
    token = decryptSecret(row.encryptedToken);
  }

  if (transport !== "ssh") {
    return { baseUrl: remoteBaseUrl, token };
  }

  const ssh = options.ssh;
  if (!ssh?.host.trim() || !ssh.user.trim()) {
    throw new HermesRuntimeError(
      "Hôte et utilisateur SSH sont requis pour tester le tunnel.",
      400,
      "SSH_CONFIG_INCOMPLETE",
    );
  }

  const host = ssh.host.trim();
  const user = ssh.user.trim();
  const port = ssh.port ?? 22;
  const auth = ssh.auth ?? "agent";

  let password: string | undefined;
  if (auth === "password") {
    password = ssh.password?.trim() || undefined;
    if (!password) {
      const reusable =
        row?.transport === "ssh" &&
        row.sshAuth === "password" &&
        row.encryptedSshPassword !== null &&
        row.sshHost === host &&
        row.sshUser === user &&
        row.sshPort === port;
      if (!reusable) {
        throw new HermesRuntimeError(
          "Saisissez le mot de passe SSH pour tester ce tunnel.",
          400,
          "SSH_PASSWORD_REQUIRED",
        );
      }
      password = decryptSecret(row.encryptedSshPassword!);
    }
  }

  const endpoint = remoteEndpoint(remoteBaseUrl);
  const baseUrl = await ensureTunnel({ host, port, user, auth, password }, endpoint.host, endpoint.port);
  return { baseUrl, token };
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
  root: string;
} | null> {
  const row = await getRuntimeRow();
  if (!row || row.transport !== "ssh") return null;
  return {
    channel: getChannel(sshTargetFromRow(row)),
    root: row.remoteWorkdir?.trim() || DEFAULT_REMOTE_WORKDIR,
  };
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

async function persistProbeResult(input: {
  status: RuntimeHealthStatus;
  version?: string | null;
  capabilities?: Record<string, unknown> | null;
}) {
  const existing = await getRuntimeRow();
  if (!existing) return;

  await getDatabase()
    .update(runtimeConfig)
    .set({
      lastHealthStatus: input.status,
      lastCheckedAt: new Date(),
      detectedVersion: input.version ?? existing.detectedVersion,
      capabilities: input.capabilities ?? existing.capabilities,
      updatedAt: new Date(),
    })
    .where(eq(runtimeConfig.id, RUNTIME_ID));
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
