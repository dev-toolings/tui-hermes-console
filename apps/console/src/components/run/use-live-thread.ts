"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@/lib/router";
import type { ThreadMessageLike } from "@assistant-ui/react";
import type {
  ProductRunStatus,
  ThreadSnapshot,
} from "@console/core/modules/runs/types";
import type { ConnectorType } from "@console/core/types/domain";
import { awaitServerReady } from "@/lib/api";
import { buildThreadMessagesFromSnapshot } from "@/lib/thread-messages";
import { consumeProductEventStream } from "@/lib/consume-product-event-stream";
import { isSessionCommandMessage } from "@console/core/modules/session/commands";
import { parseAgentMention } from "@console/core/modules/session/mentions";
import {
  getSessionCacheScope,
  onSessionCacheScopeChange,
  scopedSessionStorageKey,
} from "@/lib/session-cache-scope";
import {
  applyProductEventToSnapshot,
  isTerminalProductEvent,
  latestOpenApproval,
  type ApprovalChoice,
  type ApprovalRequest,
} from "@console/core/lib/thread-snapshot-mutations";

const ACTIVE_STATUSES: ProductRunStatus[] = [
  "pending",
  "starting",
  "running",
  "awaiting_approval",
];
/**
 * Filet de rattrapage, pas la voie normale.
 *
 * Le flux SSE de `sendMessage` porte déjà les événements du run lancé ici. Ce
 * timer ne couvre que ce qu'il ne voit pas : un run démarré ailleurs (autre
 * fenêtre, autre appareil) ou un stream coupé en route.
 *
 * Il tournait à 500 ms *en parallèle* du SSE, et chaque tour refetche le
 * snapshot complet — 563 Ko sur la conversation de test. Soit ~1,1 Mo/s et deux
 * réconciliations par seconde pendant toute la durée du run, pour des données
 * que le stream venait de livrer.
 */
const RECONNECT_POLL_MS = 3000;
const TERMINAL_REVALIDATE_POLL_MS = 10_000;
const SNAPSHOT_CACHE_LIMIT = 20;

type CachedSnapshot = { thread: ThreadSnapshot; gaps: ConnectorType[] };

/**
 * Ce que l'écran sait de la conversation, et donc ce qu'il a le droit d'afficher.
 *
 * - `cold` : rien. Aucune donnée serveur — l'écran doit montrer des squelettes,
 *   et surtout pas de valeur devinée (un statut « en attente » inventé se lit
 *   comme une information vraie).
 * - `warm` : l'en-tête est connu (titre, modèle, statut, tokens) mais pas le
 *   transcript. Le chrome s'affiche directement, seul le fil reste en squelette.
 * - `ready` : snapshot complet en main. Tout est affichable, l'envoi est permis.
 *
 * La revalidation de fond n'a pas d'état à elle : elle est invisible par
 * construction — c'est exactement ce qu'on veut éviter de faire clignoter.
 */
export type ThreadPhase = "cold" | "warm" | "ready";

/**
 * Cache mémoire des conversations déjà ouvertes. Changer de session remonte le
 * hook : sans lui, chaque switch repart de `snapshot=null` et réaffiche le
 * squelette le temps du fetch. Ici on rend immédiatement le dernier état connu,
 * puis on revalide en tâche de fond (stale-while-revalidate).
 */
const snapshotCache = new Map<string, CachedSnapshot>();

function cacheKey(threadId: string) {
  return `${getSessionCacheScope()}:${threadId}`;
}

function readSnapshotCache(threadId: string) {
  return snapshotCache.get(cacheKey(threadId)) ?? null;
}

function writeSnapshotCache(threadId: string, value: Partial<CachedSnapshot>) {
  const key = cacheKey(threadId);
  const previous = snapshotCache.get(key);
  const thread = value.thread ?? previous?.thread;
  if (!thread) return; // rien à mettre en cache tant qu'aucun snapshot n'est arrivé
  snapshotCache.delete(key); // ré-insérer garde l'ordre LRU
  snapshotCache.set(key, { thread, gaps: value.gaps ?? previous?.gaps ?? [] });
  while (snapshotCache.size > SNAPSHOT_CACHE_LIMIT) {
    const oldest = snapshotCache.keys().next().value;
    if (oldest === undefined) break;
    snapshotCache.delete(oldest);
  }
}

export function dropThreadSnapshotCache(threadId: string) {
  snapshotCache.delete(cacheKey(threadId));
  dropStoredChrome(threadId);
}

/**
 * En-têtes de conversations conservés d'un rechargement à l'autre.
 *
 * Le cache mémoire ci-dessus meurt avec la page : une navigation interne est
 * instantanée, mais F5 repayait le squelette complet — c'est le « flash au
 * refresh ». On garde donc en `sessionStorage` de quoi repeindre le chrome
 * (titre, modèle, statut, tokens, artefacts) sans attendre le réseau.
 *
 * `sessionStorage` et pas `localStorage` : le besoin est de survivre à un
 * rechargement d'onglet, pas de ressusciter un statut vieux de trois jours au
 * prochain démarrage de l'application.
 *
 * Le transcript n'y va pas. C'est lui le poids — 563 Ko sur la conversation de
 * test — et c'est aussi la seule partie dont un squelette est honnête : on ne
 * peut pas deviner des messages, alors qu'on peut légitimement réafficher le
 * titre qu'on avait sous les yeux une seconde plus tôt.
 */
const CHROME_STORAGE_KEY = "hermes-console:thread-chrome";
const CHROME_STORAGE_LIMIT = 12;
/** Au-delà, l'entrée est abandonnée plutôt que de saturer le quota d'onglet. */
const CHROME_ENTRY_MAX_CHARS = 32_000;

function readChromeStore(): Record<string, CachedSnapshot> {
  if (typeof sessionStorage === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(scopedSessionStorageKey(CHROME_STORAGE_KEY));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, CachedSnapshot>)
      : {};
  } catch {
    return {};
  }
}

function readStoredChrome(threadId: string): CachedSnapshot | null {
  const entry = readChromeStore()[threadId];
  return entry?.thread?.id ? { thread: entry.thread, gaps: entry.gaps ?? [] } : null;
}

function writeStoredChrome(threadId: string, { thread, gaps }: CachedSnapshot) {
  if (typeof sessionStorage === "undefined") return;
  const entry = JSON.stringify({ thread: { ...thread, messages: [], events: [] }, gaps });
  if (entry.length > CHROME_ENTRY_MAX_CHARS) return;

  const store = readChromeStore();
  delete store[threadId]; // ré-insérer place l'entrée en queue : l'ordre fait le LRU
  store[threadId] = JSON.parse(entry) as CachedSnapshot;
  const keys = Object.keys(store);
  for (const key of keys.slice(0, Math.max(0, keys.length - CHROME_STORAGE_LIMIT))) {
    delete store[key];
  }
  try {
    sessionStorage.setItem(scopedSessionStorageKey(CHROME_STORAGE_KEY), JSON.stringify(store));
  } catch {
    // Quota plein : le squelette reste, c'est le comportement d'avant.
  }
}

function dropStoredChrome(threadId: string) {
  if (typeof sessionStorage === "undefined") return;
  const store = readChromeStore();
  if (!(threadId in store)) return;
  delete store[threadId];
  try {
    sessionStorage.setItem(scopedSessionStorageKey(CHROME_STORAGE_KEY), JSON.stringify(store));
  } catch {
    // idem
  }
}

/** Réchauffe le cache avant le clic (survol d'une session dans la sidebar). */
export function prefetchThreadSnapshot(threadId: string) {
  if (snapshotCache.has(cacheKey(threadId))) return;
  void fetchThreadSnapshot(threadId)
    .then(({ thread, gaps }) => writeSnapshotCache(threadId, { thread, gaps }))
    .catch(() => undefined);
}

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
};

export class ThreadAccessError extends Error {
  constructor(
    readonly status: 403 | 404,
    message: string,
  ) {
    super(message);
    this.name = "ThreadAccessError";
  }
}

export type ThreadPollingGate = {
  threadId: string;
  accessDenied: boolean;
};

export function createThreadPollingGate(threadId: string): ThreadPollingGate {
  return { threadId, accessDenied: false };
}

export async function pollThreadSnapshot(
  threadId: string,
  gate: ThreadPollingGate,
  fetcher: typeof fetchThreadSnapshot = fetchThreadSnapshot,
) {
  if (gate.threadId !== threadId || gate.accessDenied) return null;
  try {
    return await fetcher(threadId);
  } catch (reason) {
    if (isThreadAccessError(reason)) gate.accessDenied = true;
    throw reason;
  }
}

function isThreadAccessError(reason: unknown): reason is ThreadAccessError {
  return reason instanceof ThreadAccessError;
}

export function useLiveThread(threadId: string) {
  const router = useRouter();
  /**
   * Deux origines possibles au premier rendu, et elles n'autorisent pas la même
   * chose : le cache mémoire porte un snapshot complet (navigation interne), le
   * `sessionStorage` seulement l'en-tête (rechargement de page).
   */
  const [cached] = useState(() => {
    const memory = readSnapshotCache(threadId);
    if (memory) return { ...memory, complete: true };
    const stored = readStoredChrome(threadId);
    return stored ? { ...stored, complete: false } : null;
  });
  const [snapshot, setSnapshot] = useState<ThreadSnapshot | null>(cached?.thread ?? null);
  const [connectorGaps, setConnectorGaps] = useState<ConnectorType[]>(cached?.gaps ?? []);
  const [commandMessages, setCommandMessages] = useState<ThreadMessageLike[]>([]);
  const [complete, setComplete] = useState(cached?.complete ?? false);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const snapshotRef = useRef<ThreadSnapshot | null>(cached?.thread ?? null);
  const pollingGateRef = useRef(createThreadPollingGate(threadId));
  if (pollingGateRef.current.threadId !== threadId) {
    pollingGateRef.current = createThreadPollingGate(threadId);
  }
  /** Un flux SSE est attaché : le filet de rattrapage n'a rien à rattraper. */
  const streamingRef = useRef(false);
  /** Le premier chargement complet. Résolue, elle ne coûte plus rien. */
  const firstFetchRef = useRef<Promise<unknown> | null>(null);
  /**
   * Miroir de `complete`, lisible depuis les callbacks sans les recréer.
   * En `warm` le snapshot existe mais n'a pas de transcript : y greffer un
   * message optimiste le ferait écraser par le premier fetch complet.
   */
  const completeRef = useRef(cached?.complete ?? false);

  const clearLocalThread = useCallback((reason?: unknown) => {
    if (isThreadAccessError(reason)) {
      pollingGateRef.current.accessDenied = true;
      setAccessDenied(true);
    }
    snapshotRef.current = null;
    completeRef.current = false;
    streamingRef.current = false;
    setSnapshot(null);
    setConnectorGaps([]);
    setCommandMessages([]);
    setComplete(false);
    setLoading(false);
    setError(reason ? toMessage(reason) : "Cette conversation n’est plus accessible.");
    dropThreadSnapshotCache(threadId);
  }, [threadId]);

  useEffect(() => {
    setAccessDenied(false);
  }, [threadId]);

  useEffect(
    () => onSessionCacheScopeChange(() => {
      snapshotCache.clear();
      clearLocalThread(new Error("Le contexte de session a changé."));
    }),
    [clearLocalThread],
  );

  const markComplete = useCallback(() => {
    completeRef.current = true;
    setComplete(true);
  }, []);

  const applySnapshot = useCallback((next: ThreadSnapshot) => {
    snapshotRef.current = next;
    writeSnapshotCache(next.id, { thread: next });
    setSnapshot(next);
  }, []);

  const applyConnectorGaps = useCallback(
    (gaps: ConnectorType[]) => {
      writeSnapshotCache(threadId, { gaps });
      setConnectorGaps(gaps);
    },
    [threadId],
  );

  const refresh = useCallback(async () => {
    let result: Awaited<ReturnType<typeof fetchThreadSnapshot>>;
    try {
      result = await fetchThreadSnapshot(threadId);
    } catch (reason) {
      if (isThreadAccessError(reason)) clearLocalThread(reason);
      throw reason;
    }
    const { thread, gaps } = result;
    const current = snapshotRef.current;
    if (current) {
      applySnapshot(mergeThreadSnapshots(current, thread));
    } else {
      applySnapshot(thread);
    }
    applyConnectorGaps(gaps);
    markComplete();
    writeStoredChrome(threadId, { thread, gaps });
    setError(null);
    return thread;
  }, [applyConnectorGaps, applySnapshot, clearLocalThread, markComplete, threadId]);

  useEffect(() => {
    if (accessDenied) return;
    let disposed = false;
    const settled = fetchThreadSnapshot(threadId)
      .then(({ thread, gaps }) => {
        if (!disposed) {
          applySnapshot(thread);
          applyConnectorGaps(gaps);
          markComplete();
        }
        // Écrit même si le composant est démonté : le prochain rechargement
        // repartira de cet en-tête plutôt que d'un squelette.
        writeStoredChrome(threadId, { thread, gaps });
      })
      .catch((reason) => {
        if (!disposed) {
          if (isThreadAccessError(reason)) clearLocalThread(reason);
          else setError(toMessage(reason));
        }
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    // Le composer est utilisable dès le premier pixel : `sendMessage` s'appuie
    // sur cette promesse pour attendre le snapshot au lieu de refuser l'envoi.
    firstFetchRef.current = settled;
    return () => {
      disposed = true;
    };
  }, [applyConnectorGaps, applySnapshot, clearLocalThread, markComplete, threadId]);

  /** Échange affiché côté client seulement — rien n'est persisté ni exécuté. */
  const pushLocalExchange = useCallback((userText: string, systemText: string) => {
    const now = new Date();
    const key = crypto.randomUUID().replaceAll("-", "");
    setCommandMessages((prev) => [
      ...prev,
      {
        id: `local_user_${key}`,
        role: "user",
        content: [{ type: "text", text: userText }],
        createdAt: now,
      },
      {
        id: `local_assistant_${key}`,
        role: "assistant",
        content: [{ type: "text", text: systemText }],
        createdAt: now,
        status: { type: "complete", reason: "stop" },
      },
    ]);
  }, []);

  const sendMessage = useCallback(
    async (message: string, files: File[] = []) => {
      setError(null);

      // `@agent …` n'exécute jamais l'agent dans la session courante : une
      // mission dédiée est créée et on y navigue. Le thread reste intact.
      const mention = parseAgentMention(message);
      if (mention) {
        if (!mention.prompt) {
          pushLocalExchange(message, `Ajoutez une instruction après « @${mention.ref} ».`);
          return;
        }
        if (files.length > 0) {
          pushLocalExchange(
            message,
            "Les pièces jointes ne passent pas par une mention `@`. Lancez la mission, puis joignez les fichiers depuis celle-ci.",
          );
          return;
        }

        const response = await fetch("/api/threads", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Le résultat est déjà rendu dans le fil : pas de toast en double.
            "X-Hermes-Toast": "0",
          },
          body: JSON.stringify({ agentRef: mention.ref, message: mention.prompt }),
        });
        const body = (await response.json()) as {
          threadId?: string;
          error?: { message?: string };
        };
        if (!response.ok || !body.threadId) {
          pushLocalExchange(message, body.error?.message ?? "La mission n’a pas pu être créée.");
          return;
        }
        router.push(`/runs/${body.threadId}`);
        return;
      }

      if (isSessionCommandMessage(message) && files.length === 0) {
        const response = await fetch(
          `/api/threads/${encodeURIComponent(threadId)}/commands`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message }),
          },
        );
        const body = (await response.json()) as {
          handled?: boolean;
          systemMessage?: string;
          refreshThread?: boolean;
          navigateTo?: string;
          error?: { message?: string };
        };
        if (!response.ok) {
          const err = body.error?.message ?? `La commande a échoué (${response.status}).`;
          setError(err);
          throw new Error(err);
        }
        if (body.handled) {
          pushLocalExchange(message, body.systemMessage ?? "Commande exécutée.");
          if (body.refreshThread) {
            await refresh().catch((reason) => setError(toMessage(reason)));
          }
          if (body.navigateTo) {
            router.push(body.navigateTo);
          }
          return;
        }
      }

      /*
        On peut taper avant que la conversation soit là — c'est même le cas
        courant sur un lien profond. Plutôt que de refuser l'envoi, on attend
        le premier chargement : l'utilisateur a rédigé pendant la latence, il
        n'a pas à la repayer.
      */
      if (!completeRef.current) {
        await firstFetchRef.current?.catch(() => undefined);
      }
      const current = snapshotRef.current;
      if (!current) {
        throw new Error("Conversation non chargée.");
      }

      const now = new Date().toISOString();
      const optimisticRunId = `optimistic_run_${crypto.randomUUID().replaceAll("-", "")}`;
      const optimisticMessageId = `optimistic_msg_${crypto.randomUUID().replaceAll("-", "")}`;

      applySnapshot({
        ...current,
        updatedAt: now,
        messages: [
          ...current.messages,
          {
            id: optimisticMessageId,
            role: "user",
            content: [{ type: "text", text: message }],
            runId: optimisticRunId,
            createdAt: now,
          },
        ],
        runs: [
          ...current.runs,
          {
            id: optimisticRunId,
            status: "pending",
            input: message,
            output: null,
            usage: null,
            error: null,
            hermesResponseId: null,
            runtimeSession: null,
            createdAt: now,
            startedAt: null,
            endedAt: null,
            lastEventAt: null,
          },
        ],
      });

      let accepted = false;
      try {
        const useMultipart = files.length > 0;
        const response = await fetch(
          `/api/threads/${encodeURIComponent(threadId)}/messages?stream=1`,
          {
            method: "POST",
            headers: useMultipart
              ? { Accept: "text/event-stream" }
              : {
                  "Content-Type": "application/json",
                  Accept: "text/event-stream",
                },
            body: useMultipart
              ? (() => {
                  const form = new FormData();
                  form.set("message", message);
                  for (const file of files) form.append("files", file);
                  return form;
                })()
              : JSON.stringify({ message }),
          },
        );
        if (!response.ok) {
          applySnapshot(current);
          const messageText = await readApiError(response);
          if (response.status === 403 || response.status === 404) {
            clearLocalThread(new ThreadAccessError(response.status, messageText));
          }
          setError(messageText);
          throw new Error(messageText);
        }
        accepted = true;

        let createdRunId: string | null = null;
        streamingRef.current = true;
        await consumeProductEventStream(response, {
          onMeta: ({ runId }) => {
            createdRunId = runId;
            const optimistic = snapshotRef.current;
            if (!optimistic) return;
            applySnapshot({
              ...optimistic,
              messages: optimistic.messages.map((item) =>
                item.id === optimisticMessageId
                  ? { ...item, id: `msg_pending_${runId}`, runId }
                  : item,
              ),
              runs: optimistic.runs.map((run) =>
                run.id === optimisticRunId
                  ? { ...run, id: runId, status: "starting" as const }
                  : run,
              ),
            });
          },
          onEvent: (event) => {
            const live = snapshotRef.current;
            if (!live) return;
            applySnapshot(applyProductEventToSnapshot(live, event));
          },
        });

        if (createdRunId) {
          await refresh().catch((reason) => setError(toMessage(reason)));
        }
      } catch (reason) {
        if (!accepted) {
          applySnapshot(current);
        }
        if (reason instanceof Error) throw reason;
        throw new Error(toMessage(reason), { cause: reason });
      } finally {
        // Y compris si le stream a cassé : le filet reprend la main.
        streamingRef.current = false;
      }
    },
    [applySnapshot, clearLocalThread, pushLocalExchange, refresh, router, threadId],
  );

  const latestRun = snapshot?.runs.at(-1) ?? null;
  const isRunning = latestRun ? ACTIVE_STATUSES.includes(latestRun.status) : false;

  const approval = useMemo((): ApprovalRequest | null => {
    if (!snapshot || !latestRun || latestRun.status !== "awaiting_approval") {
      return null;
    }
    return latestOpenApproval(snapshot.events, latestRun.id);
  }, [latestRun, snapshot]);

  useEffect(() => {
    if (accessDenied) return;
    let disposed = false;
    let refreshing = false;
    const reconcile = async () => {
      if (disposed || refreshing || streamingRef.current) return;
      refreshing = true;
      try {
        const polled = await pollThreadSnapshot(
          threadId,
          pollingGateRef.current,
        );
        if (!polled) return;
        const { thread: server } = polled;
        const local = snapshotRef.current;
        if (!local || disposed) return;

        const merged = mergeThreadSnapshots(local, server);
        const newEvents = merged.events.filter((event) => event.cursor > local.cursor);
        if (newEvents.length === 0) {
          applySnapshot(merged);
          return;
        }

        let next = merged;
        for (const event of newEvents) {
          next = applyProductEventToSnapshot(next, event);
        }
        applySnapshot(next);

        if (newEvents.some(isTerminalProductEvent)) {
          await refresh();
        }
      } catch (reason) {
        if (!disposed) {
          if (isThreadAccessError(reason)) clearLocalThread(reason);
          else setError(toMessage(reason));
        }
      } finally {
        refreshing = false;
      }
    };

    const timer = window.setInterval(() => {
      void reconcile();
    }, isRunning ? RECONNECT_POLL_MS : TERMINAL_REVALIDATE_POLL_MS);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [accessDenied, applySnapshot, clearLocalThread, isRunning, refresh, threadId]);

  const cancel = useCallback(async () => {
    const run = snapshotRef.current?.runs.at(-1);
    if (!run || !ACTIVE_STATUSES.includes(run.status)) return;
    const response = await fetch(`/api/runs/${encodeURIComponent(run.id)}/cancel`, {
      method: "POST",
    });
    if (!response.ok) {
      const message = await readApiError(response);
      setError(message);
      throw new Error(message);
    }
  }, []);

  const retry = useCallback(async () => {
    const run = snapshotRef.current?.runs.at(-1);
    if (!run) return;
    if (ACTIVE_STATUSES.includes(run.status)) {
      setError("Impossible de relancer une mission encore active.");
      return;
    }

    setError(null);
    const response = await fetch(`/api/runs/${encodeURIComponent(run.id)}/retry`, {
      method: "POST",
    });
    if (!response.ok) {
      const message = await readApiError(response);
      setError(message);
      throw new Error(message);
    }

    await refresh().catch((reason) => setError(toMessage(reason)));
  }, [refresh]);

  const respondApproval = useCallback(
    async (choice: ApprovalChoice) => {
      const run = snapshotRef.current?.runs.at(-1);
      if (!run || run.status !== "awaiting_approval") return;

      const response = await fetch(`/api/runs/${encodeURIComponent(run.id)}/approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ choice }),
      });
      if (!response.ok) {
        const message = await readApiError(response);
        setError(message);
        throw new Error(message);
      }

      const live = snapshotRef.current;
      if (live) {
        applySnapshot({
          ...live,
          runs: live.runs.map((item) =>
            item.id === run.id ? { ...item, status: "running" as const } : item,
          ),
        });
      }
      await refresh().catch((reason) => setError(toMessage(reason)));
    },
    [applySnapshot, refresh],
  );

  const messages = useMemo(() => {
    /*
      Seul un snapshot complet produit un transcript. L'en-tête restauré depuis
      `sessionStorage` porte les runs mais ni messages ni événements : le
      constructeur en tirait un message assistant vide — une barre d'actions et
      une heure suspendues dans le vide, là où le squelette est la bonne
      réponse. Un transcript ne se devine pas ; un titre, si.
    */
    const base = snapshot && complete ? buildThreadMessagesFromSnapshot(snapshot) : [];
    return commandMessages.length ? [...base, ...commandMessages] : base;
  }, [commandMessages, complete, snapshot]);

  const phase: ThreadPhase = complete ? "ready" : snapshot ? "warm" : "cold";

  return {
    snapshot,
    latestRun,
    messages,
    connectorGaps,
    isRunning,
    approval,
    phase,
    loading,
    error,
    refresh,
    sendMessage,
    cancel,
    retry,
    respondApproval,
  };
}

async function readApiError(response: Response) {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return body.error?.message ?? `La requête a échoué (${response.status}).`;
  } catch {
    return `La requête a échoué (${response.status}).`;
  }
}

async function fetchThreadSnapshot(threadId: string) {
  // Une conversation peut être la toute première route affichée (lien profond,
  // dernier onglet restauré) : comme les `loader`, elle doit laisser au sidecar
  // le temps d'écouter plutôt que d'échouer sur un serveur qui démarre encore.
  await awaitServerReady();
  const response = await fetch(`/api/threads/${encodeURIComponent(threadId)}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    const message = await readApiError(response);
    if (response.status === 403 || response.status === 404) {
      dropThreadSnapshotCache(threadId);
      throw new ThreadAccessError(response.status, message);
    }
    throw new Error(message);
  }
  const body = (await response.json()) as {
    thread: ThreadSnapshot;
    connectorGaps?: ConnectorType[];
  };
  return { thread: body.thread, gaps: body.connectorGaps ?? [] };
}

function toMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : "Impossible de charger la conversation.";
}

function mergeThreadSnapshots(
  local: ThreadSnapshot,
  server: ThreadSnapshot,
): ThreadSnapshot {
  const eventsByCursor = new Map<number, (typeof local.events)[number]>();
  for (const event of server.events) eventsByCursor.set(event.cursor, event);
  for (const event of local.events) {
    if (!eventsByCursor.has(event.cursor)) eventsByCursor.set(event.cursor, event);
  }

  const events = [...eventsByCursor.values()].sort((a, b) => a.cursor - b.cursor);
  const cursor = Math.max(local.cursor, server.cursor, events.at(-1)?.cursor ?? 0);

  return {
    ...server,
    cursor,
    events,
  };
}
