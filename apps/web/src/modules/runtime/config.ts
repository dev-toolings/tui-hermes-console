import { eq } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { runtimeConfig, type RuntimeHealthStatus } from "@/db/schema";
import { decryptSecret, encryptSecret, hasEncryptionKey } from "@/lib/crypto";
import {
  HermesRuntimeError,
  testHermesRuntimeAgainst,
  type HermesCapabilities,
} from "./hermes-adapter";

const RUNTIME_ID = "default";

export type RuntimePublicDto = {
  configured: boolean;
  source: "database" | "env" | "none";
  baseUrl: string | null;
  name: string | null;
  tokenConfigured: boolean;
  detectedVersion: string | null;
  capabilities: Record<string, unknown> | null;
  lastHealthStatus: RuntimeHealthStatus;
  lastCheckedAt: string | null;
  updatedAt: string | null;
};

export type ResolvedRuntimeConfig = {
  baseUrl: string;
  token: string;
  source: "database" | "env";
};

export async function getRuntimePublic(): Promise<RuntimePublicDto> {
  const row = await getRuntimeRow();
  if (row) {
    return {
      configured: true,
      source: "database",
      baseUrl: row.baseUrl,
      name: row.name,
      tokenConfigured: true,
      detectedVersion: row.detectedVersion,
      capabilities: row.capabilities,
      lastHealthStatus: row.lastHealthStatus,
      lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  const envUrl = process.env.HERMES_BASE_URL?.replace(/\/+$/, "") ?? null;
  const envToken = Boolean(process.env.HERMES_RUNTIME_TOKEN);
  if (envUrl && envToken) {
    return {
      configured: true,
      source: "env",
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
    return {
      baseUrl: row.baseUrl.replace(/\/+$/, "").trim(),
      token: decryptSecret(row.encryptedToken),
      source: "database",
    };
  }

  const baseUrl = (process.env.HERMES_BASE_URL ?? "http://127.0.0.1:8642")
    .trim()
    .replace(/\/+$/, "");
  const token = process.env.HERMES_RUNTIME_TOKEN?.trim();
  if (!token) {
    throw new HermesRuntimeError(
      "Le runtime Hermes n’est pas configuré. Renseignez URL + token dans Paramètres → Runtime.",
      503,
      "HERMES_RUNTIME_TOKEN_MISSING",
    );
  }
  return { baseUrl, token, source: "env" };
}

export async function saveRuntimeConfig(input: {
  baseUrl: string;
  token?: string;
  name?: string;
}): Promise<RuntimePublicDto> {
  if (!hasEncryptionKey()) {
    throw new HermesRuntimeError(
      "APP_ENCRYPTION_KEY manquant côté serveur — impossible de stocker le token.",
      503,
      "APP_ENCRYPTION_KEY_MISSING",
    );
  }

  const baseUrl = input.baseUrl.replace(/\/+$/, "").trim();
  const existing = await getRuntimeRow();
  let encryptedToken = existing?.encryptedToken;
  if (input.token?.trim()) {
    encryptedToken = encryptSecret(input.token.trim());
  }
  if (!encryptedToken) {
    throw new HermesRuntimeError(
      "Un token d’accès est requis pour enregistrer la connexion.",
      400,
      "HERMES_TOKEN_REQUIRED",
    );
  }

  const now = new Date();
  const db = getDatabase();
  if (existing) {
    await db
      .update(runtimeConfig)
      .set({
        name: input.name?.trim() || existing.name,
        baseUrl,
        encryptedToken,
        updatedAt: now,
      })
      .where(eq(runtimeConfig.id, RUNTIME_ID));
  } else {
    await db.insert(runtimeConfig).values({
      id: RUNTIME_ID,
      name: input.name?.trim() || "Hermes",
      baseUrl,
      encryptedToken,
      lastHealthStatus: "unknown",
      createdAt: now,
      updatedAt: now,
    });
  }

  return getRuntimePublic();
}

export async function probeAndPersistRuntime(options?: {
  baseUrl?: string;
  token?: string;
}): Promise<{
  ok: true;
  health: unknown;
  capabilities: HermesCapabilities;
  runtime: RuntimePublicDto;
}> {
  const resolved = options?.baseUrl && options?.token
    ? { baseUrl: options.baseUrl.replace(/\/+$/, ""), token: options.token }
    : options?.baseUrl
      ? {
          baseUrl: options.baseUrl.replace(/\/+$/, ""),
          token: (await resolveHermesRuntimeConfig()).token,
        }
      : await resolveHermesRuntimeConfig();

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
      baseUrl: resolved.baseUrl,
    });

    return { ok: true, ...result, runtime: await getRuntimePublic() };
  } catch (error) {
    const status: RuntimeHealthStatus =
      error instanceof HermesRuntimeError && error.status === 401
        ? "unauthorized"
        : "unreachable";
    await persistProbeResult({ status, baseUrl: resolved.baseUrl });
    throw error;
  }
}

async function persistProbeResult(input: {
  status: RuntimeHealthStatus;
  version?: string | null;
  capabilities?: Record<string, unknown> | null;
  baseUrl: string;
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
