"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ThreadMessageLike } from "@assistant-ui/react";
import type {
  ProductRunStatus,
  ThreadSnapshot,
} from "@/modules/runs/types";
import type { ConnectorType } from "@/db/schema";
import { buildThreadMessagesFromSnapshot } from "@/lib/thread-messages";
import { consumeProductEventStream } from "@/lib/consume-product-event-stream";
import { isSessionCommandMessage } from "@/modules/session/commands";
import { parseAgentMention } from "@/modules/session/mentions";
import {
  applyProductEventToSnapshot,
  isTerminalProductEvent,
  latestOpenApproval,
  type ApprovalRequest,
} from "@/lib/thread-snapshot-mutations";

const ACTIVE_STATUSES: ProductRunStatus[] = [
  "pending",
  "starting",
  "running",
  "awaiting_approval",
];
const RECONNECT_POLL_MS = 500;
const SNAPSHOT_CACHE_LIMIT = 20;

type CachedSnapshot = { thread: ThreadSnapshot; gaps: ConnectorType[] };

/**
 * Cache mémoire des conversations déjà ouvertes. Changer de session remonte le
 * hook : sans lui, chaque switch repart de `snapshot=null` et réaffiche le
 * squelette le temps du fetch. Ici on rend immédiatement le dernier état connu,
 * puis on revalide en tâche de fond (stale-while-revalidate).
 */
const snapshotCache = new Map<string, CachedSnapshot>();

function readSnapshotCache(threadId: string) {
  return snapshotCache.get(threadId) ?? null;
}

function writeSnapshotCache(threadId: string, value: Partial<CachedSnapshot>) {
  const previous = snapshotCache.get(threadId);
  const thread = value.thread ?? previous?.thread;
  if (!thread) return; // rien à mettre en cache tant qu'aucun snapshot n'est arrivé
  snapshotCache.delete(threadId); // ré-insérer garde l'ordre LRU
  snapshotCache.set(threadId, { thread, gaps: value.gaps ?? previous?.gaps ?? [] });
  while (snapshotCache.size > SNAPSHOT_CACHE_LIMIT) {
    const oldest = snapshotCache.keys().next().value;
    if (oldest === undefined) break;
    snapshotCache.delete(oldest);
  }
}

export function dropThreadSnapshotCache(threadId: string) {
  snapshotCache.delete(threadId);
}

/** Réchauffe le cache avant le clic (survol d'une session dans la sidebar). */
export function prefetchThreadSnapshot(threadId: string) {
  if (snapshotCache.has(threadId)) return;
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

export function useLiveThread(threadId: string) {
  const router = useRouter();
  const [cached] = useState(() => readSnapshotCache(threadId));
  const [snapshot, setSnapshot] = useState<ThreadSnapshot | null>(cached?.thread ?? null);
  const [connectorGaps, setConnectorGaps] = useState<ConnectorType[]>(cached?.gaps ?? []);
  const [commandMessages, setCommandMessages] = useState<ThreadMessageLike[]>([]);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const snapshotRef = useRef<ThreadSnapshot | null>(cached?.thread ?? null);

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
    const { thread, gaps } = await fetchThreadSnapshot(threadId);
    const current = snapshotRef.current;
    if (current) {
      applySnapshot(mergeThreadSnapshots(current, thread));
    } else {
      applySnapshot(thread);
    }
    applyConnectorGaps(gaps);
    setError(null);
    return thread;
  }, [applyConnectorGaps, applySnapshot, threadId]);

  useEffect(() => {
    let disposed = false;
    void fetchThreadSnapshot(threadId)
      .then(({ thread, gaps }) => {
        if (!disposed) {
          applySnapshot(thread);
          applyConnectorGaps(gaps);
        }
      })
      .catch((reason) => {
        if (!disposed) setError(toMessage(reason));
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [applyConnectorGaps, applySnapshot, threadId]);

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
          setError(messageText);
          throw new Error(messageText);
        }
        accepted = true;

        let createdRunId: string | null = null;
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
        throw new Error(toMessage(reason));
      }
    },
    [applySnapshot, pushLocalExchange, refresh, router, threadId],
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
    if (!isRunning) return;

    let disposed = false;
    let refreshing = false;
    const reconcile = async () => {
      if (disposed || refreshing) return;
      refreshing = true;
      try {
        const { thread: server } = await fetchThreadSnapshot(threadId);
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
        if (!disposed) setError(toMessage(reason));
      } finally {
        refreshing = false;
      }
    };

    const timer = window.setInterval(() => {
      void reconcile();
    }, RECONNECT_POLL_MS);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [applySnapshot, isRunning, refresh, threadId]);

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
    async (approved: boolean) => {
      const run = snapshotRef.current?.runs.at(-1);
      if (!run || run.status !== "awaiting_approval") return;

      const response = await fetch(`/api/runs/${encodeURIComponent(run.id)}/approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved }),
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
    const base = snapshot ? buildThreadMessagesFromSnapshot(snapshot) : [];
    return commandMessages.length ? [...base, ...commandMessages] : base;
  }, [commandMessages, snapshot]);

  return {
    snapshot,
    latestRun,
    messages,
    connectorGaps,
    isRunning,
    approval,
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
  const response = await fetch(`/api/threads/${encodeURIComponent(threadId)}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await readApiError(response));
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
