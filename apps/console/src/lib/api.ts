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
  RuntimePublicDto,
  StorageStats,
} from "@console/core/types/api";
import type {
  RunActivityPoint,
  ThreadListItemDto,
} from "@console/core/modules/runs/types";
import type { RuntimeProbeDto } from "@console/core/modules/runtime/probe";

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

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
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

export const fetchAgents = () =>
  getJson<{ agents: AgentDto[] }>("/api/agents").then((r) => r.agents);

export const fetchAgent = (agentId: string) =>
  getJson<{ agent: AgentDto }>(`/api/agents/${encodeURIComponent(agentId)}`).then(
    (r) => r.agent,
  );

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

export const fetchActivity = (days = 30) =>
  getJson<{ activity: RunActivityPoint[] }>(`/api/runs/activity?days=${days}`).then(
    (r) => r.activity,
  );

export const fetchArtifacts = (limit = 50) =>
  getJson<{ artifacts: ArtifactDto[] }>(`/api/files?limit=${limit}`).then(
    (r) => r.artifacts,
  );

export const fetchStorage = () =>
  getJson<{ stats: StorageStats; limits: FileLimits }>("/api/settings/storage");

export const fetchRuntimeProbe = () =>
  getJson<{ probe: RuntimeProbeDto }>("/api/runtime/probe").then((r) => r.probe);
