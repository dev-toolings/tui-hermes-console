import type { ThreadMessageLike } from "@assistant-ui/react";
import { extractUiSpec } from "@/lib/generative-ui";
import type { MessageContent } from "@console/core/types/domain";
import type { ProductRunStatus, ThreadSnapshot } from "@console/core/modules/runs/types";

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
        // Le vrai nom de l'outil, pas le nom de synthèse `hermes_tool` : c'est
        // lui qui permet à un `makeAssistantToolUI` dédié de prendre la main
        // sur le rendu générique. Les messages déjà en base gardent l'ancien
        // nom et restent rendus par `HermesToolCallUI`.
        toolName: String(ev.payload.tool ?? "outil"),
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

      // Un outil qui renvoie un spec d'interface le voit rendu juste après son
      // appel, comme un résultat à part entière — pas replié dans le groupe.
      const spec = result ? extractUiSpec(result.payload.result) : null;
      if (spec) parts.push({ type: "generative-ui", spec });
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
  return content.flatMap((part): Part[] => {
    if (part.type === "text") return [part];
    if (part.type === "reasoning") return [part];

    const call: Part = {
      type: "tool-call" as const,
      toolCallId: part.toolCallId,
      toolName: part.toolName,
      args: part.args as never,
      ...(part.result !== undefined ? { result: part.result } : {}),
    };

    // Même règle que sur le flux live : un spec porté par le résultat est
    // rendu, qu'il vienne du stream ou de la base.
    const output = (part.result as { output?: unknown } | undefined)?.output;
    const spec = extractUiSpec(output);
    return spec ? [call, { type: "generative-ui", spec }] : [call];
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

/**
 * Messages déjà convertis, indexés par l’objet source.
 *
 * `applyProductEventToSnapshot` ne recopie jamais `snapshot.messages` : il ne
 * touche qu’`events`, `runs` et `cursor`. Un message déjà converti reste donc
 * valable tant que le statut de son run n’a pas bougé.
 *
 * Ça compte parce que les `ThreadMessageLike` sont comparés par identité en
 * aval : reconstruire les N messages à chaque événement SSE — mesuré, 100 % des
 * identités recréées à chaque fois — faisait re-rendre le fil entier, et
 * reparser tout son markdown, pour un seul message qui changeait vraiment.
 *
 * `WeakMap` plutôt qu’un cache par `id` : la clé est l’objet lui-même, donc pas
 * d’invalidation à écrire ni de fuite quand la conversation est déchargée.
 */
const convertedMessages = new WeakMap<
  object,
  { status: ProductRunStatus; error: string | null; built: ThreadMessageLike }
>();

/** Snapshot live multi-turn + éventuelle queue d’événements du run en cours. */
export function buildThreadMessagesFromSnapshot(snapshot: ThreadSnapshot): ThreadMessageLike[] {
  const runsById = new Map(snapshot.runs.map((run) => [run.id, run]));

  const result: ThreadMessageLike[] = snapshot.messages.map((message) => {
    const run = message.runId ? runsById.get(message.runId) : undefined;
    const status = run?.status ?? "completed";
    const error = run?.error ?? null;

    const cached = convertedMessages.get(message);
    if (cached && cached.status === status && cached.error === error) {
      return cached.built;
    }

    const built: ThreadMessageLike = {
      id:
        message.role === "assistant" && message.runId
          ? `assistant_${message.runId}`
          : message.id,
      role: message.role,
      content: contentToParts(message.content),
      createdAt: new Date(message.createdAt),
      ...(message.role === "assistant"
        ? {
            status: assistantStatusForRun(status, error),
          }
        : {}),
    };
    convertedMessages.set(message, { status, error, built });
    return built;
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
