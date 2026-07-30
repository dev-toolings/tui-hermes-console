/**
 * Les formes que l'API HTTP renvoie.
 *
 * Elles étaient déclarées dans les modules serveur, au plus près des requêtes
 * qui les produisent. Le SPA les lit désormais par HTTP : le contrat doit donc
 * vivre là où les deux côtés peuvent le nommer, sinon il se dédouble et dérive.
 *
 * Les modules serveur les ré-exportent, pour continuer à les importer au même
 * endroit qu'avant.
 */
import type {
  ArtifactDirection,
  RuntimeHealthStatus,
  RuntimeSshAuth,
  RuntimeTransport,
} from "./domain";

/** `GET /api/agents`, `GET /api/agents/:agentId` */
export type AgentDto = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  instructions: string;
  provider: string | null;
  model: string | null;
  reasoningEffort: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  runs: number;
  lastRunAt: string | null;
};

/** `GET /api/files` — jamais le chemin de stockage, seulement de quoi l'afficher. */
export type ArtifactDto = {
  id: string;
  runId: string;
  direction: ArtifactDirection;
  filename: string;
  mimeType: string | null;
  sizeBytes: number;
  checksumSha256: string;
  createdAt: string;
};

/**
 * `GET /api/runtime` — la vue publique de la connexion runtime.
 *
 * « Public » au sens strict : ni le token, ni le mot de passe SSH n'y figurent,
 * seulement des booléens disant s'ils sont configurés.
 */
export type RuntimePublicDto = {
  configured: boolean;
  source: "database" | "env" | "none";
  transport: RuntimeTransport;
  baseUrl: string | null;
  name: string | null;
  tokenConfigured: boolean;
  /** `APP_ENCRYPTION_KEY` est présente : les secrets peuvent être chiffrés au repos. */
  encryptionReady: boolean;
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

/** `GET /api/settings/storage` */
export type StorageStats = {
  agents: number;
  threads: number;
  messages: number;
  events: number;
  runtimeConfigured: boolean;
};

export type FileLimits = {
  maxFile: number;
  maxTotal: number;
  maxCount: number;
};
