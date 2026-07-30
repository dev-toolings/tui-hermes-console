import type { StoredProductEvent } from "@/modules/runs/types";

/** Sous-ensemble UIMessageStreamChunk compatible assistant-stream / AI SDK. */
export type HermesUiStreamChunk =
  | { type: "text-delta"; textDelta: string }
  | { type: "reasoning-delta"; delta: string }
  | {
      type: "tool-call-start";
      id: string;
      toolCallId: string;
      toolName: string;
    }
  | {
      type: "tool-result";
      toolCallId: string;
      result: unknown;
      isError?: boolean;
    }
  | { type: "finish"; finishReason: "stop" | "error" | "other" }
  | { type: "error"; errorText: string };

export function productEventToUiStreamChunks(
  event: StoredProductEvent,
): HermesUiStreamChunk[] {
  switch (event.type) {
    case "agent.message": {
      const text = String(event.payload.text ?? "");
      return text ? [{ type: "text-delta", textDelta: text }] : [];
    }
    case "agent.reasoning": {
      const delta = String(event.payload.text ?? "");
      return delta ? [{ type: "reasoning-delta", delta }] : [];
    }
    case "tool.call": {
      const toolCallId = String(event.payload.toolCallId ?? "");
      const toolName = String(event.payload.tool ?? "outil");
      return [
        {
          type: "tool-call-start",
          id: toolCallId,
          toolCallId,
          toolName,
        },
      ];
    }
    case "tool.result":
      return [
        {
          type: "tool-result",
          toolCallId: String(event.payload.toolCallId ?? ""),
          result: {
            durationMs: event.payload.durationMs,
            error: event.payload.error,
            hasResultPayload: event.payload.hasResultPayload,
            output: event.payload.result,
          },
          isError: event.payload.error === true,
        },
      ];
    case "run.completed":
      return [{ type: "finish", finishReason: "stop" }];
    case "run.error":
      return [
        { type: "error", errorText: String(event.payload.message ?? "Erreur Hermes.") },
        { type: "finish", finishReason: "error" },
      ];
    case "system.notice":
      if (event.payload.kind === "cancelled") {
        return [{ type: "finish", finishReason: "other" }];
      }
      return [];
    default:
      return [];
  }
}
