import type { Usage } from "@/db/schema";
import type { ServerSentEvent } from "@/modules/runtime/sse";
import type { ProductEventInput, ProductEventType } from "@console/core/modules/runs/types";

export class HermesResponsesNormalizer {
  private sequence = 0;
  private textBuffer = "";
  private textStartedAt: Date | null = null;
  private reasoningBuffer = "";
  private reasoningStartedAt: Date | null = null;
  private emittedReasoning = false;

  push(event: ServerSentEvent): ProductEventInput[] {
    const type = String(event.data.type ?? event.event);
    const at = new Date();

    if (type === "response.output_text.delta") {
      this.textBuffer += String(event.data.delta ?? "");
      this.textStartedAt ??= at;
      return [];
    }

    // OpenAI Responses reasoning summary stream (quand Hermes l’expose).
    if (
      type === "response.reasoning_summary_text.delta" ||
      type === "response.reasoning_text.delta"
    ) {
      this.reasoningBuffer += String(event.data.delta ?? "");
      this.reasoningStartedAt ??= at;
      return [];
    }

    if (type === "response.output_item.added") {
      const item = asRecord(event.data.item);
      if (item.type === "function_call") {
        return [
          ...this.flush(),
          this.next("tool.call", at, {
            toolCallId: String(item.call_id ?? item.id ?? `call_${this.sequence}`),
            tool: String(item.name ?? "outil"),
            arguments: parseArguments(item.arguments),
            preview: previewArguments(item.arguments),
          }),
        ];
      }
      if (item.type === "function_call_output") {
        return [
          ...this.flush(),
          this.next("tool.result", at, {
            toolCallId: String(item.call_id ?? ""),
            result: normalizeToolOutput(item.output),
            error: item.status === "failed",
            hasResultPayload: true,
          }),
        ];
      }
      if (item.type === "reasoning") {
        const summary = reasoningItemText(item);
        if (!summary) return [];
        return [...this.flush(), ...this.emitReasoning(at, summary)];
      }
      return [];
    }

    if (type === "response.completed") {
      const response = asRecord(event.data.response);
      return [
        ...this.flush(),
        ...this.reasoningFromOutput(response, at),
        this.next("run.completed", at, {
          responseId: response.id ?? null,
          output: responseText(response),
          usage: normalizeUsage(response.usage),
        }),
      ];
    }

    if (type === "response.failed" || type === "response.incomplete") {
      const response = asRecord(event.data.response);
      const error = asRecord(response.error);
      return [
        ...this.flush(),
        this.next("run.error", at, {
          message: String(error.message ?? `Hermes a terminé avec le statut ${response.status ?? "failed"}.`),
        }),
      ];
    }

    if (type === "response.created") return [];

    if (type === "response.output_item.done") {
      const item = asRecord(event.data.item);
      if (item.type !== "reasoning") return [];
      const summary = reasoningItemText(item);
      if (!summary) return [];
      return [...this.flush(), ...this.emitReasoning(at, summary)];
    }

    return [
      ...this.flush(),
      this.next("raw", at, {
        protocol: "responses",
        event: event.event,
        data: event.data,
      }),
    ];
  }

  private emitReasoning(at: Date, text: string): ProductEventInput[] {
    if (!text.trim() || this.emittedReasoning) return [];
    this.emittedReasoning = true;
    return [this.next("agent.reasoning", at, { text })];
  }

  private reasoningFromOutput(
    response: Record<string, unknown>,
    at: Date,
  ): ProductEventInput[] {
    if (this.emittedReasoning) return [];
    const output = Array.isArray(response.output) ? response.output : [];
    const events: ProductEventInput[] = [];
    for (const item of output) {
      const record = asRecord(item);
      if (record.type !== "reasoning") continue;
      const text = reasoningItemText(record);
      if (!text.trim()) continue;
      events.push(...this.emitReasoning(at, text));
    }
    return events;
  }

  flush(): ProductEventInput[] {
    const out: ProductEventInput[] = [];
    if (this.reasoningBuffer) {
      out.push(...this.emitReasoning(this.reasoningStartedAt ?? new Date(), this.reasoningBuffer));
      this.reasoningBuffer = "";
      this.reasoningStartedAt = null;
    }
    if (this.textBuffer) {
      out.push(
        this.next("agent.message", this.textStartedAt ?? new Date(), {
          text: this.textBuffer,
        }),
      );
      this.textBuffer = "";
      this.textStartedAt = null;
    }
    return out;
  }

  notice(message: string, kind: string): ProductEventInput {
    return this.next("system.notice", new Date(), { message, kind });
  }

  error(message: string): ProductEventInput {
    return this.next("run.error", new Date(), { message });
  }

  private next(
    type: ProductEventType,
    occurredAt: Date,
    payload: Record<string, unknown>,
  ): ProductEventInput {
    return { sequence: this.sequence++, type, occurredAt, payload };
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function parseArguments(value: unknown): unknown {
  if (typeof value !== "string") return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function previewArguments(value: unknown) {
  const raw = typeof value === "string" ? value : JSON.stringify(value ?? {});
  return raw.length > 160 ? `${raw.slice(0, 157)}…` : raw;
}

function normalizeToolOutput(value: unknown): unknown {
  if (!Array.isArray(value)) return value ?? null;
  const text = value
    .map((part) => {
      const record = asRecord(part);
      return typeof record.text === "string" ? record.text : JSON.stringify(record);
    })
    .join("\n");
  return text;
}

function reasoningItemText(item: Record<string, unknown>) {
  if (typeof item.summary === "string") return item.summary;
  const summary = Array.isArray(item.summary) ? item.summary : [];
  const fromSummary = summary
    .map((part) => {
      const record = asRecord(part);
      return typeof record.text === "string" ? record.text : "";
    })
    .join("");
  if (fromSummary) return fromSummary;
  const content = Array.isArray(item.content) ? item.content : [];
  return content
    .map((part) => {
      const record = asRecord(part);
      return typeof record.text === "string" ? record.text : "";
    })
    .join("");
}

function responseText(response: Record<string, unknown>) {
  const output = Array.isArray(response.output) ? response.output : [];
  return output
    .flatMap((item) => {
      const record = asRecord(item);
      if (record.type !== "message") return [];
      const content = Array.isArray(record.content) ? record.content : [];
      return content.map((part) => {
        const contentPart = asRecord(part);
        return contentPart.type === "output_text" ? String(contentPart.text ?? "") : "";
      });
    })
    .join("");
}

function normalizeUsage(value: unknown): Usage | null {
  const usage = asRecord(value);
  if (Object.keys(usage).length === 0) return null;
  return {
    inputTokens: Number(usage.input_tokens ?? 0),
    outputTokens: Number(usage.output_tokens ?? 0),
    totalTokens: Number(usage.total_tokens ?? 0),
  };
}
