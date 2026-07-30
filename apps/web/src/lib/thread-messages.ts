import type { ThreadMessageLike } from "@assistant-ui/react";
import type { MessageContent } from "@/db/schema";
import type { ProductRunStatus, ThreadSnapshot } from "@/modules/runs/types";

const ACTIVE_STATUSES: ProductRunStatus[] = [
  "pending",
  "starting",
  "running",
  "awaiting_approval",
];

type EventLike = {
  type: string;
  payload: Record<string, unknown>;
};

/** `ThreadMessageLike["content"]` est readonly : on construit dans un tableau mutable. */
type Part = Extract<ThreadMessageLike["content"], readonly unknown[]>[number];

/**
 * Convertit une séquence d’événements produit en parts assistant-ui
 * (text / reasoning / tool-call), dans l’ordre réel du stream.
 */
export function buildPartsFromEvents(events: EventLike[]): Part[] {
  const parts: Part[] = [];
  const pendingResults = new Map<string, EventLike>();

  for (const ev of events) {
    if (ev.type === "tool.result") {
      pendingResults.set(String(ev.payload.toolCallId ?? ""), ev);
    }
  }

  for (const ev of events) {
    if (ev.type === "agent.message") {
      const text = String(ev.payload.text ?? "");
      const last = parts.at(-1);
      if (last && last.type === "text") {
        parts[parts.length - 1] = { type: "text", text: last.text + text };
      } else {
        parts.push({ type: "text", text });
      }
      continue;
    }

    if (ev.type === "agent.reasoning") {
      const text = String(ev.payload.text ?? "");
      if (!text.trim()) continue;
      const last = parts.at(-1);
      if (last && last.type === "reasoning") {
        parts[parts.length - 1] = { type: "reasoning", text: last.text + text };
      } else {
        parts.push({ type: "reasoning", text });
      }
      continue;
    }

    if (ev.type === "tool.call") {
      const toolCallId = String(ev.payload.toolCallId ?? "");
      const result = pendingResults.get(toolCallId);
      parts.push({
        type: "tool-call",
        toolCallId,
        toolName: "hermes_tool",
        args: {
          tool: String(ev.payload.tool ?? "outil"),
          preview: ev.payload.preview == null ? null : String(ev.payload.preview),
          arguments: (ev.payload.arguments ?? null) as never,
        },
        ...(result
          ? {
              result: {
                durationMs: result.payload.durationMs,
                error: result.payload.error,
                hasResultPayload: result.payload.hasResultPayload,
                output: result.payload.result,
              },
            }
          : {}),
      });
    }
  }

  return parts;
}

/**
 * @deprecated Préférer `buildPartsFromEvents` — les tool parts sont inclus dans le live stream.
 */
export function buildLivePartsFromEvents(events: EventLike[]): Part[] {
  return buildPartsFromEvents(events).filter(
    (part) => part.type === "text" || part.type === "reasoning",
  );
}

export function buildMessages(prompt: string, events: EventLike[]): ThreadMessageLike[] {
  const parts = buildPartsFromEvents(events);
  return [
    { role: "user", id: "prompt", content: [{ type: "text", text: prompt }] },
    {
      role: "assistant",
      id: "run",
      content: parts.length ? parts : [{ type: "text", text: "" }],
    },
  ];
}

export function contentToParts(content: MessageContent): Part[] {
  return content.map((part) => {
    if (part.type === "text") return part;
    if (part.type === "reasoning") return part;
    return {
      type: "tool-call" as const,
      toolCallId: part.toolCallId,
      toolName: part.toolName,
      args: part.args as never,
      ...(part.result !== undefined ? { result: part.result } : {}),
    };
  });
}

function assistantStatusForRun(
  status: ProductRunStatus,
  error: string | null,
): NonNullable<ThreadMessageLike["status"]> {
  if (ACTIVE_STATUSES.includes(status)) return { type: "running" };
  if (status === "failed") {
    return {
      type: "incomplete",
      reason: "error",
      error: error ?? "Erreur Hermes.",
    };
  }
  if (status === "cancelled") {
    return { type: "incomplete", reason: "cancelled" };
  }
  return { type: "complete", reason: "stop" };
}

/** Snapshot live multi-turn + éventuelle queue d’événements du run en cours. */
export function buildThreadMessagesFromSnapshot(snapshot: ThreadSnapshot): ThreadMessageLike[] {
  const runsById = new Map(snapshot.runs.map((run) => [run.id, run]));

  const result: ThreadMessageLike[] = snapshot.messages.map((message) => {
    const run = message.runId ? runsById.get(message.runId) : undefined;
    return {
      id:
        message.role === "assistant" && message.runId
          ? `assistant_${message.runId}`
          : message.id,
      role: message.role,
      content: contentToParts(message.content),
      createdAt: new Date(message.createdAt),
      ...(message.role === "assistant"
        ? {
            status: assistantStatusForRun(
              run?.status ?? "completed",
              run?.error ?? null,
            ),
          }
        : {}),
    };
  });

  const latestRun = snapshot.runs.at(-1);
  if (!latestRun) return result;
  if (
    snapshot.messages.some(
      (message) => message.role === "assistant" && message.runId === latestRun.id,
    )
  ) {
    return result;
  }

  const liveEvents = snapshot.events.filter((event) => event.runId === latestRun.id);
  const parts = buildPartsFromEvents(liveEvents);
  result.push({
    role: "assistant",
    id: `assistant_${latestRun.id}`,
    content: parts.length ? parts : [],
    status: assistantStatusForRun(latestRun.status, latestRun.error),
    createdAt: new Date(latestRun.createdAt),
  });
  return result;
}
