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
  RuntimeCredentialAdapter,
  RuntimeManagementMode,
  RuntimeSshAuth,
  RuntimeTransport,
  RuntimeWorkspaceStatus,
} from "./domain";

export type { RuntimeCredentialAdapter, RuntimeManagementMode } from "./domain";

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

/** `GET /api/skills` — inventaire des skills exposés par Hermes. */
export type HermesSkillDto = {
  name: string;
  description: string;
  category: string | null;
  enabled: boolean;
};

export type HermesAchievementState = "unlocked" | "discovered" | "secret";

/** Un badge du plugin Dashboard `hermes-achievements`, tel que proxyé par la Console. */
export type HermesAchievementDto = {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string | null;
  state: HermesAchievementState;
  unlocked: boolean;
  discovered: boolean;
  unlockedAt: number | null;
  progress: number | null;
  progressPct: number | null;
  /** Tier le plus haut atteint, ex. « Gold ». */
  tier: string | null;
  nextTier: string | null;
  nextThreshold: number | null;
  criteria: string | null;
};

export type HermesAchievementsScanState = "idle" | "running" | "failed" | "pending";

export type HermesAchievementsScanStatusDto = {
  state: HermesAchievementsScanState;
  startedAt: number | null;
  finishedAt: number | null;
  lastError: string | null;
  lastDurationMs: number | null;
  runCount: number;
  snapshotStale: boolean;
  snapshotGeneratedAt: number | null;
};

export type HermesAchievementsDto = {
  achievements: HermesAchievementDto[];
  unlockedCount: number;
  discoveredCount: number;
  secretCount: number;
  totalCount: number;
  error: string | null;
  isStale: boolean;
  scanStatus: HermesAchievementsScanStatusDto;
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
  deletedAt: string | null;
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
  managementMode: RuntimeManagementMode;
  credentialAdapter: RuntimeCredentialAdapter;
  lastCredentialRotatedAt: string | null;
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

export type HermesRuntimeUpdateMethod =
  | "native"
  | "docker-compose"
  | "external"
  | "unknown";

export type HermesRuntimeUpdatePlanDto = {
  supported: boolean;
  available: boolean;
  method: HermesRuntimeUpdateMethod;
  transport: RuntimeTransport;
  configRevision: number | null;
  currentVersion: string | null;
  latestVersion: string | null;
  latestTag: string | null;
  releaseName: string | null;
  releaseUrl: string | null;
  reason: string | null;
  checkedAt: string;
};

export type HermesRuntimeUpdateResultDto = {
  updated: boolean;
  rolledBack: boolean;
  previousVersion: string | null;
  currentVersion: string | null;
  method: HermesRuntimeUpdateMethod;
  plan: HermesRuntimeUpdatePlanDto;
};

export type HermesRuntimeUpdateOperationStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "rolled_back"
  | "failed"
  | "recovery_required";

export type HermesRuntimeUpdateOperationPhase =
  | "preflight"
  | "backup"
  | "download"
  | "apply"
  | "verify"
  | "rollback"
  | "complete";

export type HermesRuntimeUpdateOperationDto = {
  id: string;
  trigger: "manual" | "automatic";
  status: HermesRuntimeUpdateOperationStatus;
  phase: HermesRuntimeUpdateOperationPhase;
  progress: number;
  message: string;
  method: HermesRuntimeUpdateMethod;
  previousVersion: string | null;
  targetVersion: string | null;
  targetTag: string;
  currentVersion: string | null;
  error?: { code: string; message: string };
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type RuntimeCredentialOperationDto = {
  id: string;
  operation: "import" | "generate" | "rotate";
  adapter: RuntimeCredentialAdapter;
  status:
    | "planned"
    | "applying"
    | "verifying"
    | "succeeded"
    | "rolled_back"
    | "failed"
    | "recovery_required";
  phase: string;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type RuntimeCredentialPlanDto = {
  id: string;
  operation: "import" | "generate" | "rotate";
  adapter: RuntimeCredentialAdapter;
  target: string;
  configRevision: number;
  expectedDowntime: boolean;
  confirmation: string;
  blockers: string[];
  warnings: string[];
};

/** `GET /api/runtime/dashboard` — état public du Dashboard Hermes. */
export type HermesDashboardDto = {
  status: "running" | "stopped" | "unreachable" | "unsupported" | "unknown";
  manager: "systemd-user" | "systemd-system" | "docker" | "docker-s6" | "s6" | "cli" | "unknown";
  transport: "local" | "ssh";
  port: number;
  version: string | null;
  canStart: boolean;
  canRestart: boolean;
  reason: string | null;
  checkedAt: string;
};

export type HermesDashboardLifecycleAction = "start" | "restart";

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
    manager: "docker" | "systemd-user" | "systemd-system" | "native-process" | "unknown";
    serviceUnit: string | null;
    serviceUser: string | null;
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
  storageMigration?: RuntimeSshStorageMigrationAvailabilityDto;
  checkedAt: string;
};

export type RuntimeDirectWorkspaceProofLevel =
  | "verified"
  | "console_only"
  | "misaligned"
  | "unavailable";

export type RuntimeDirectWorkspaceDiscoveryDto = {
  transport: "direct";
  scope: "local" | "remote";
  configRevision: number | null;
  proofLevel: RuntimeDirectWorkspaceProofLevel;
  reasonCode:
    | "DIRECT_WORKSPACE_VERIFIED"
    | "DIRECT_WORKSPACE_CONSOLE_ONLY"
    | "DIRECT_WORKSPACE_MISALIGNED"
    | "DIRECT_WORKSPACE_UNAVAILABLE"
    | "DIRECT_REMOTE_WORKSPACE_UNSUPPORTED";
  sharedWorkdir: {
    path: string;
    source: "env" | "default";
    exists: boolean;
    readable: boolean;
    writable: boolean;
    symlink: boolean;
  } | null;
  hermesTerminalCwd: string | null;
  warnings: string[];
  blockers: string[];
  restartRequired: boolean;
  checkedAt: string;
};

export type RuntimeWorkspaceDiscoveryDto =
  | ({ transport: "ssh" } & RuntimeSshWorkspaceDiscoveryDto)
  | RuntimeDirectWorkspaceDiscoveryDto;

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
    dashboard: "listening" | "closed" | "unknown";
    dashboardManager:
      | "systemd-user"
      | "systemd-system"
      | "docker"
      | "docker-s6"
      | "s6"
      | "cli"
      | "unknown";
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
  /** Identité privilégiée utilisée uniquement pour préparer l'hôte. */
  provisioner: { host: string; port: number; user: string };
  /** Identité non privilégiée persistée pour tunnel, SFTP et missions. */
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

export type RuntimeSshStorageMigrationAvailabilityDto = {
  state: "available" | "manual_required";
  reasonCode: string;
  defaultTargetRoot: string;
  sourceVolume: string | null;
  sourceBytes: number | null;
};

export type RuntimeSshStorageMigrationStepDto = {
  id: string;
  label: string;
  description: string;
  destructive: boolean;
};

export type RuntimeSshStorageMigrationPlanDto = {
  id: string;
  expectedRevision: number;
  source: {
    containerName: string;
    volumeName: string;
    bytes: number;
    fileCount: number;
    imageDigest: string;
  };
  target: {
    hostDataRoot: string;
    hermesDataRoot: "/opt/data";
    hostWorkspace: string;
    hermesWorkspace: "/opt/data/workspace";
    composeDirectory: string;
    backupDirectory: string;
  };
  steps: RuntimeSshStorageMigrationStepDto[];
  blockers: string[];
  warnings: string[];
  confirmation: string;
  expiresAt: string;
};

export type RuntimeSshStorageMigrationStatus =
  | "planned"
  | "queued"
  | "running"
  | "succeeded"
  | "rolled_back"
  | "failed"
  | "recovery_required";

export type RuntimeSshStorageMigrationPhase =
  | "preflight"
  | "backup"
  | "copy"
  | "cutover"
  | "verify"
  | "activate"
  | "rollback"
  | "complete";

export type RuntimeSshStorageMigrationJobDto = {
  id: string;
  status: RuntimeSshStorageMigrationStatus;
  phase: RuntimeSshStorageMigrationPhase;
  progress: number;
  message: string;
  rollbackAvailable: boolean;
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
