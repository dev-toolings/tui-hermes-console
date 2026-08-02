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
import type { AuditEntryDto } from "@console/core/modules/audit/types";

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

export const fetchAgents = (includeArchived = false) =>
  getJson<{ agents: AgentDto[] }>(
    includeArchived ? "/api/agents?includeArchived=true" : "/api/agents",
  ).then((r) => r.agents);

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

export const fetchStorage = () =>
  getJson<{ stats: StorageStats; limits: FileLimits }>("/api/settings/storage");

export const fetchRuntimeProbe = () =>
  getJson<{ probe: RuntimeProbeDto }>("/api/runtime/probe").then((r) => r.probe);

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
    { method: "POST" },
  );

export const retryRun = (runId: string) =>
  getJson<{ threadId: string; runId: string; sourceRunId: string }>(
    `/api/runs/${encodeURIComponent(runId)}/retry`,
    { method: "POST" },
  );
