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

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
};

export function useLiveThread(threadId: string) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<ThreadSnapshot | null>(null);
  const [connectorGaps, setConnectorGaps] = useState<ConnectorType[]>([]);
  const [commandMessages, setCommandMessages] = useState<ThreadMessageLike[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const snapshotRef = useRef<ThreadSnapshot | null>(null);

  const applySnapshot = useCallback((next: ThreadSnapshot) => {
    snapshotRef.current = next;
    setSnapshot(next);
  }, []);

  const refresh = useCallback(async () => {
    const { thread, gaps } = await fetchThreadSnapshot(threadId);
    const current = snapshotRef.current;
    if (current) {
      applySnapshot(mergeThreadSnapshots(current, thread));
    } else {
      applySnapshot(thread);
    }
    setConnectorGaps(gaps);
    setError(null);
    return thread;
  }, [applySnapshot, threadId]);

  useEffect(() => {
    let disposed = false;
    void fetchThreadSnapshot(threadId)
      .then(({ thread, gaps }) => {
        if (!disposed) {
          applySnapshot(thread);
          setConnectorGaps(gaps);
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
  }, [applySnapshot, threadId]);

  const sendMessage = useCallback(
    async (message: string, files: File[] = []) => {
      setError(null);

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
          const now = new Date().toISOString();
          setCommandMessages((prev) => [
            ...prev,
            {
              id: `cmd_user_${now}`,
              role: "user",
              content: [{ type: "text", text: message }],
              createdAt: new Date(now),
            },
            {
              id: `cmd_assistant_${now}`,
              role: "assistant",
              content: [{ type: "text", text: body.systemMessage ?? "Commande exécutée." }],
              createdAt: new Date(now),
              status: { type: "complete", reason: "stop" },
            },
          ]);
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
    [applySnapshot, refresh, router, threadId],
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
