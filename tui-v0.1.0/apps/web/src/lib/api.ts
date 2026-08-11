/**
 * Client de l'API Console.
 *
 * En dev, Vite proxifie `/api` vers `apps/server` (port 3170) ; empaqueté,
 * Tauri lance ce même serveur en sidecar sur 127.0.0.1 et sert le SPA depuis
 * la même origine. Le SPA n'a donc jamais d'URL absolue à connaître.
 *
 * Les écrans lisaient ces données en appelant les repositories pendant le rendu
 * serveur de Next. Ce module est ce qui remplace cet accès direct : une seule
 * fonction par écran, appelée depuis le `loader` de sa route.
 */
import type {
  AgentDto,
  ArtifactDto,
  FileLimits,
  HermesSkillDto,
  HermesAchievementsDto,
  HermesAchievementsScanStatusDto,
  HermesDashboardDto,
  HermesDashboardLifecycleAction,
  HermesRuntimeUpdatePlanDto,
  HermesRuntimeUpdateOperationDto,
  RuntimePublicDto,
  StorageStats,
} from "@console/core/types/api";
import type {
  RunActivityPoint,
  InboxMissionPage,
  ThreadListItemDto,
} from "@console/core/modules/runs/types";
import type { RuntimeProbeDto } from "@console/core/modules/runtime/probe";
import type { AuditEntryDto } from "@console/core/modules/audit/types";
import type { GuidedTaskDraft } from "@console/core/modules/guided-task/spec";
import type { GuidedInboxPage, GuidedTaskDto } from "@console/core/modules/guided-task/task";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Mesuré : le sidecar met ~1,1 s à écouter (binaire de 65 Mo + Postgres). */
const BOOT_DEADLINE_MS = 20_000;
const BOOT_POLL_MS = 100;

let serverReady: Promise<void> | null = null;

/**
 * Attend que l'API réponde, une seule fois pour toute la session.
 *
 * Tauri ouvre désormais la fenêtre sans attendre le sidecar : la coque s'affiche
 * tout de suite au lieu de laisser l'écran vide une seconde. En contrepartie les
 * `loader` peuvent partir avant que le serveur n'écoute — c'est ce qui affichait
 * « /api/agents a répondu HTTP 500 » alors que rien n'était cassé, seulement trop
 * tôt. Ce garde absorbe cette fenêtre de démarrage.
 *
 * La promesse est mémoïsée : les `loader` parallèles partagent une seule sonde,
 * et une fois le serveur vu vivant le coût retombe à zéro. Passé l'échéance on
 * laisse simplement la vraie requête partir : mieux vaut son message d'erreur
 * que d'attendre indéfiniment.
 */
export function awaitServerReady() {
  serverReady ??= (async () => {
    const deadline = Date.now() + BOOT_DEADLINE_MS;
    for (;;) {
      try {
        // En dev le proxy Vite répond 500 quand l'amont est injoignable ; en
        // production le `fetch` rejette. `response.ok` couvre les deux.
        //
        // Le type de contenu n'est pas une précaution de principe : un `/api`
        // qui n'atteint pas le serveur peut très bien répondre 200 — le
        // protocole d'assets de Tauri renvoie l'`index.html` pour tout chemin
        // inconnu. Sans cette vérification, le garde se déclare prêt sur une
        // page HTML et laisse les `loader` échouer juste après.
        const response = await fetch("/api/healthz", { cache: "no-store" });
        if (response.ok && response.headers.get("content-type")?.includes("json")) {
          return;
        }
      } catch {
        // Sidecar pas encore à l'écoute — ce n'est pas une panne.
      }
      if (Date.now() >= deadline) return;
      await new Promise((resolve) => setTimeout(resolve, BOOT_POLL_MS));
    }
  })();
  return serverReady;
}

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  await awaitServerReady();
  const response = await fetch(path, { cache: "no-store", ...init });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: { code?: string; message?: string } }
      | null;
    throw new ApiError(
      response.status,
      body?.error?.code ?? null,
      body?.error?.message ?? `${path} a répondu HTTP ${response.status}.`,
    );
  }
  return (await response.json()) as T;
}

export const fetchRuntime = () =>
  getJson<{ runtime: RuntimePublicDto }>("/api/runtime").then((r) => r.runtime);

export const fetchHermesDashboard = () =>
  getJson<{ dashboard: HermesDashboardDto }>("/api/runtime/dashboard").then(
    (r) => r.dashboard,
  );

export const fetchAchievements = () =>
  getJson<{ achievements: HermesAchievementsDto }>("/api/runtime/achievements").then(
    (r) => r.achievements,
  );

export const fetchAchievementsScanStatus = () =>
  getJson<{ status: HermesAchievementsScanStatusDto }>(
    "/api/runtime/achievements/scan-status",
  ).then((r) => r.status);

export const manageHermesDashboard = (
  action: HermesDashboardLifecycleAction,
  signal?: AbortSignal,
) =>
  getJson<{ dashboard: HermesDashboardDto }>("/api/runtime/dashboard", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hermes-Toast": "0",
    },
    body: JSON.stringify({ action, confirm: true }),
    signal,
  }).then((r) => r.dashboard);

export const fetchAgents = (includeArchived = false) =>
  getJson<{ agents: AgentDto[] }>(
    includeArchived ? "/api/agents?includeArchived=true" : "/api/agents",
  ).then((r) => r.agents);

export const fetchAgent = (agentId: string) =>
  getJson<{ agent: AgentDto }>(`/api/agents/${encodeURIComponent(agentId)}`).then(
    (r) => r.agent,
  );

export type SkillsResponse = {
  skills: HermesSkillDto[];
  projectId: string | null;
  scope: "project" | "site";
  skillsMutable: boolean;
};

export const fetchSkills = () => getJson<SkillsResponse>("/api/skills");

export const toggleSkill = (name: string, enabled: boolean) =>
  getJson<{ name: string; enabled: boolean }>("/api/skills/toggle", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Hermes-Toast": "0",
    },
    body: JSON.stringify({ name, enabled }),
  });

/**
 * `source` n'est pas optionnel par confort : l'Aperçu et l'écran Missions ne
 * comptent que les missions. L'omettre remonterait aussi les sessions de chat
 * libre — c'est exactement l'écart qui faisait afficher 3 conversations au SPA
 * là où le web en comptait 2.
 */
export const fetchThreads = (source: "mission" | "chat" | "all" = "all") =>
  getJson<{ threads: ThreadListItemDto[] }>(
    source === "all" ? "/api/threads" : `/api/threads?source=${source}`,
  ).then((r) => r.threads);

export const fetchInboxMissions = (input: { limit?: number; cursor?: string } = {}) => {
  const query = new URLSearchParams();
  if (input.limit) query.set("limit", String(input.limit));
  if (input.cursor) query.set("cursor", input.cursor);
  return getJson<InboxMissionPage>(`/api/inbox/missions${query.size > 0 ? `?${query}` : ""}`);
};

export const fetchAuditEntries = (limit = 200) =>
  getJson<{ entries: AuditEntryDto[] }>(`/api/audit?limit=${limit}`).then(
    (response) => response.entries,
  );

export const fetchActivity = (days = 30) =>
  getJson<{ activity: RunActivityPoint[] }>(`/api/runs/activity?days=${days}`).then(
    (r) => r.activity,
  );

export const fetchArtifacts = (limit = 50) =>
  getJson<{ artifacts: ArtifactDto[] }>(`/api/files?limit=${limit}`).then(
    (r) => r.artifacts,
  );

export const deleteArtifact = (fileId: string) =>
  getJson<{
    deleted: true;
    artifactId: string;
    runId: string;
    filename: string;
    deletedAt: string;
    cleanupPending: boolean;
  }>(`/api/files/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
    headers: { "X-Hermes-Toast": "deleted" },
  });

export type LifecyclePolicyDto = {
  siteId: string;
  version: number;
  retentionDays: number;
  legalHoldEnabled: boolean;
  legalHoldReason: string | null;
  updatedByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type LifecyclePreviewItemDto = {
  resourceId: string;
  activityAt: string;
  runCount: number;
  messageCount: number;
  artifactCount: number;
  artifactBytes: number;
  runIds: string[];
  artifactHashes: string[];
};

export type LifecyclePreviewDto = {
  id: string;
  siteId: string;
  policyVersion: number;
  retentionDays: number;
  cutoffAt: string;
  manifestSha256: string;
  createdByUserId: string;
  createdAt: string;
  items: LifecyclePreviewItemDto[];
};

export const fetchLifecyclePolicy = () =>
  getJson<{ policy: LifecyclePolicyDto }>("/api/settings/data-lifecycle").then(
    (response) => response.policy,
  );

export const saveLifecyclePolicy = (input: {
  retentionDays: number;
  legalHoldEnabled: boolean;
  legalHoldReason: string | null;
  expectedVersion: number;
}) =>
  getJson<{ policy: LifecyclePolicyDto }>("/api/settings/data-lifecycle", {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Hermes-Toast": "0" },
    body: JSON.stringify(input),
  }).then((response) => response.policy);

export const createLifecyclePreview = () =>
  getJson<{ preview: LifecyclePreviewDto }>("/api/settings/data-lifecycle/previews", {
    method: "POST",
    headers: { "X-Hermes-Toast": "0" },
  }).then((response) => response.preview);

export const purgeLifecyclePreview = (previewId: string) =>
  getJson<{
    purge: {
      previewId: string;
      purgedAt: string;
      purgedThreadCount: number;
      purgedRunCount: number;
      purgedArtifactCount: number;
      cleanupPending: boolean;
    };
  }>("/api/settings/data-lifecycle/purges", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Hermes-Toast": "deleted" },
    body: JSON.stringify({ previewId }),
  }).then((response) => response.purge);

export async function downloadLifecycleExport(previewId: string) {
  await awaitServerReady();
  const response = await fetch("/api/settings/data-lifecycle/exports", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json", "X-Hermes-Toast": "0" },
    body: JSON.stringify({ previewId }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: { code?: string; message?: string } }
      | null;
    throw new ApiError(
      response.status,
      body?.error?.code ?? null,
      body?.error?.message ?? "L’export de rétention a échoué.",
    );
  }
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = "hermes-console-data-lifecycle-export.json";
  anchor.click();
  URL.revokeObjectURL(href);
}

export const fetchHermesUpdates = (limit = 20) =>
  getJson<{
    releases: Array<{
      id: number;
      tagName: string;
      name: string | null;
      body: string | null;
      htmlUrl: string;
      publishedAt: string;
      createdAt: string;
      prerelease: boolean;
      draft: boolean;
    }>;
  }>(`/api/updates/hermes?limit=${limit}`).then((response) => response.releases);

export const fetchHermesRuntimeUpdatePlan = () =>
  getJson<{ plan: HermesRuntimeUpdatePlanDto; activeOperation: HermesRuntimeUpdateOperationDto | null }>("/api/runtime/update").then(
    (response) => response.plan,
  );

export const fetchHermesRuntimeUpdateState = () =>
  getJson<{ plan: HermesRuntimeUpdatePlanDto; activeOperation: HermesRuntimeUpdateOperationDto | null }>("/api/runtime/update");

export const startHermesRuntimeUpdate = (input: {
  expectedConfigRevision: number | null;
  targetTag: string;
  trigger: "manual" | "automatic";
}) =>
  getJson<{ operation: HermesRuntimeUpdateOperationDto }>("/api/runtime/update", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Hermes-Toast": "0" },
    body: JSON.stringify({ confirm: true, ...input }),
  }).then((response) => response.operation);

export const fetchHermesRuntimeUpdateOperation = (operationId: string) =>
  getJson<{ operation: HermesRuntimeUpdateOperationDto }>(`/api/runtime/update/${encodeURIComponent(operationId)}`)
    .then((response) => response.operation);

export const fetchStorage = () =>
  getJson<{ stats: StorageStats; limits: FileLimits }>("/api/settings/storage");

export const fetchRuntimeProbe = () =>
  getJson<{ probe: RuntimeProbeDto }>("/api/runtime/probe").then((r) => r.probe);

export type GuidedRepositorySummary = {
  projectId: string;
  projectName: string;
  configured: boolean;
  rootPath: string | null;
  baseRef: string | null;
  testCommands: string[][];
  networkPolicy: "none" | "host" | null;
};

export const fetchGuidedRepositories = () =>
  getJson<{ repositories: GuidedRepositorySummary[] }>("/api/guided/repositories")
    .then((response) => response.repositories);

export const saveGuidedRepository = (
  projectId: string,
  input: {
    rootPath: string;
    baseRef: string;
    testCommands: string[][];
    networkPolicy: "none" | "host";
  },
) => getJson<{ repository: unknown }>(
  `/api/guided/repositories/${encodeURIComponent(projectId)}`,
  {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Hermes-Toast": "0" },
    body: JSON.stringify(input),
  },
).then((response) => response.repository);

export const createGuidedRepositoryProject = (input: {
  projectName: string;
  rootPath: string;
  baseRef: string;
  testCommands: string[][];
  networkPolicy: "none" | "host";
}) => getJson<{ repository: { projectId: string } }>("/api/guided/repositories", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Hermes-Toast": "0" },
  body: JSON.stringify(input),
}).then((response) => response.repository);

export const fetchGuidedTasks = (input: { limit?: number; cursor?: string } = {}) => {
  const query = new URLSearchParams();
  if (input.limit) query.set("limit", String(input.limit));
  if (input.cursor) query.set("cursor", input.cursor);
  const suffix = query.size > 0 ? `?${query}` : "";
  return getJson<GuidedInboxPage>(`/api/guided/tasks${suffix}`);
};

export const fetchGuidedTask = (taskId: string) =>
  getJson<{ task: GuidedTaskDto }>(`/api/guided/tasks/${encodeURIComponent(taskId)}`)
    .then((response) => response.task);

export const createGuidedTask = (input: {
  projectId: string;
  draft: GuidedTaskDraft;
  idempotencyKey: string;
}) => getJson<{ task: GuidedTaskDto }>("/api/guided/tasks", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Hermes-Toast": "0" },
  body: JSON.stringify(input),
}).then((response) => response.task);

export const createGuidedRevision = (
  taskId: string,
  input: { draft: GuidedTaskDraft; validate: boolean; idempotencyKey: string },
) => getJson<{ task: GuidedTaskDto }>(
  `/api/guided/tasks/${encodeURIComponent(taskId)}/revisions`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Hermes-Toast": "0" },
    body: JSON.stringify(input),
  },
).then((response) => response.task);

export const decideGuidedTask = (
  taskId: string,
  input: {
    revisionId: string;
    attemptId?: string | null;
    kind: "technical" | "tool" | "functional";
    outcome: "approved" | "rejected";
    idempotencyKey: string;
    reason?: string | null;
  },
) => getJson<{ task: GuidedTaskDto }>(
  `/api/guided/tasks/${encodeURIComponent(taskId)}/decisions`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Hermes-Toast": "0" },
    body: JSON.stringify(input),
  },
).then((response) => response.task);

export const startGuidedAttempt = (
  taskId: string,
  input: { revisionId: string; idempotencyKey: string },
) => getJson<{ task: GuidedTaskDto }>(
  `/api/guided/tasks/${encodeURIComponent(taskId)}/attempts`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Hermes-Toast": "0" },
    body: JSON.stringify(input),
  },
).then((response) => response.task);

/**
 * Les deux seules mutations qu'une mission accepte depuis une liste.
 *
 * Elles répondent 202 : l'annulation part vers le runtime, la relance crée un
 * nouveau run et le démarre. Dans les deux cas l'état affiché ne devient vrai
 * qu'au rechargement du loader — d'où l'absence de mise à jour optimiste chez
 * l'appelant.
 */
export const cancelRun = (runId: string) =>
  getJson<{ runId: string; status: "stopping" | "cancelled" }>(
    `/api/runs/${encodeURIComponent(runId)}/cancel`,
    { method: "POST", headers: { "X-Hermes-Toast": "0" } },
  );

export const retryRun = (runId: string) =>
  getJson<{ threadId: string; runId: string; sourceRunId: string }>(
    `/api/runs/${encodeURIComponent(runId)}/retry`,
    { method: "POST", headers: { "X-Hermes-Toast": "0" } },
  );
