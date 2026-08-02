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
  RuntimeWorkspaceStatus,
} from "./domain";

/** `GET /api/agents`, `GET /api/agents/:agentId` */
export type AgentDto = {
  id: string;
  projectId?: string | null;
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
  /** Chemin équivalent vu par le process Hermes (peut différer en Docker). */
  remoteHermesWorkdir: string | null;
  workspaceStatus: RuntimeWorkspaceStatus;
  /** Révision publique non secrète utilisée pour les sauvegardes CAS. */
  configRevision: number | null;
  detectedVersion: string | null;
  capabilities: Record<string, unknown> | null;
  lastHealthStatus: RuntimeHealthStatus;
  lastCheckedAt: string | null;
  updatedAt: string | null;
};

export type RuntimeSshHostKeyDto = {
  host: string;
  port: number;
  lookup: string;
  keyType: string;
  keyBase64: string;
  fingerprintSha256: string;
};

export type RuntimeSshWorkspaceCandidateSource =
  | "terminal_cwd"
  | "hermes_workspace"
  | "console_managed";

export type RuntimeSshWorkspaceCandidateDto = {
  id: string;
  source: RuntimeSshWorkspaceCandidateSource;
  label: string;
  /** Chemin du VPS accessible en SFTP par la Console. */
  remoteWorkdir: string;
  /** Chemin absolu utilisé dans les prompts et visible par Hermes. */
  remoteHermesWorkdir: string;
  exists: boolean;
  writable: boolean;
  durable: boolean;
  recommended: boolean;
  requiresCreation: boolean;
  warning: string | null;
};

export type RuntimeSshWorkspaceDiscoveryDto = {
  configRevision: number;
  installation: {
    mode: "native" | "docker" | "unknown";
    /** Répertoire de données Hermes vu par Hermes. Jamais son contenu. */
    hermesHome: string | null;
    terminalCwd: string | null;
    resolvedTerminalCwd: string | null;
    dockerMount: {
      type: "bind" | "volume";
      source: string;
      destination: string;
    } | null;
  };
  candidates: RuntimeSshWorkspaceCandidateDto[];
  warnings: string[];
  blockers: string[];
  checkedAt: string;
};

export type RuntimeProvisionMode = "docker" | "native";

export type RuntimeSshTargetInput = {
  host: string;
  port: number;
  user: string;
  auth: "agent" | "password";
  password?: string;
};

export type RuntimeSshInspectionDto = {
  target: {
    host: string;
    port: number;
    user: string;
  };
  client: {
    sshAvailable: boolean;
    agentAvailable: boolean;
    knownHostStatus: "known" | "unknown" | "mismatch" | "unavailable";
    configAlias: string | null;
  };
  remote: {
    reachable: boolean;
    os: string | null;
    osVersion: string | null;
    architecture: string | null;
    sudo: "available" | "root" | "missing" | "password_required" | "unknown";
    docker: "available" | "missing" | "unknown";
    systemd: "available" | "missing" | "unknown";
    hermes: "healthy" | "unreachable" | "missing" | "unknown";
    hermesVersion: string | null;
    hermesMode: "docker" | "native" | "unknown";
    port8642: "listening" | "closed" | "unknown";
    workdir: "ready" | "missing" | "not_writable" | "unknown";
  };
  warnings: string[];
  checkedAt: string;
};

export type RuntimeSshPlanStep = {
  id: string;
  label: string;
  description: string;
  commandPreview: string | null;
  destructive: boolean;
};

export type RuntimeSshPlanDto = {
  mode: RuntimeProvisionMode;
  target: { host: string; port: number; user: string };
  remoteBaseUrl: string;
  remoteWorkdir: string;
  steps: RuntimeSshPlanStep[];
  blockers: string[];
  warnings: string[];
  confirmation: string;
};

export type RuntimeSshProvisionJobDto = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  mode: RuntimeProvisionMode;
  step: string | null;
  progress: number;
  message: string;
  runtime?: RuntimePublicDto;
  error?: { code: string; message: string };
  createdAt: string;
  updatedAt: string;
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
