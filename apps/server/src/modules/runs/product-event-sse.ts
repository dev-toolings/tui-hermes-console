import { subscribeToThread } from "./event-bus";
import { listThreadEventsAfter } from "./repository";
import type { StoredProductEvent } from "@console/core/modules/runs/types";
import { isTerminalProductEvent } from "@console/core/lib/thread-snapshot-mutations";

export const PRODUCT_EVENT_SSE_HEADERS = {
  "Cache-Control": "no-cache, no-transform",
  "Content-Type": "text/event-stream; charset=utf-8",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
  "X-Content-Type-Options": "nosniff",
} as const;

export function encodeProductEventSse(
  event: StoredProductEvent,
  eventName = "run.event",
) {
  return `id: ${event.cursor}\nevent: ${eventName}\ndata: ${JSON.stringify(event)}\n\n`;
}

export function encodeRunMetaSse(payload: { threadId: string; runId: string }) {
  return `event: run.meta\ndata: ${JSON.stringify(payload)}\n\n`;
}

type StreamOptions = {
  threadId: string;
  runId?: string;
  cursor?: number;
  signal: AbortSignal;
  closeOnTerminal?: boolean;
};

export function createProductEventStream({
  threadId,
  runId,
  cursor: initialCursor = 0,
  signal,
  closeOnTerminal = false,
}: StreamOptions) {
  let cursor = initialCursor;
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        cleanup();
        try {
          controller.close();
        } catch {
          // Le navigateur peut avoir fermé le flux en premier.
        }
      };

      const send = (event: StoredProductEvent) => {
        if (closed || event.cursor <= cursor) return;
        if (runId && event.runId !== runId) return;
        cursor = event.cursor;
        controller.enqueue(encoder.encode(encodeProductEventSse(event)));
        if (closeOnTerminal && isTerminalProductEvent(event)) close();
      };

      if (runId) {
        controller.enqueue(encoder.encode(encodeRunMetaSse({ threadId, runId })));
      }

      const unsubscribe = subscribeToThread(threadId, send);
      for (const event of await listThreadEventsAfter(threadId, cursor)) send(event);

      const reconcile = setInterval(async () => {
        try {
          for (const event of await listThreadEventsAfter(threadId, cursor)) send(event);
        } catch {
          close();
        }
      }, 2_000);
      const heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`));
      }, 15_000);

      const onAbort = () => close();
      signal.addEventListener("abort", onAbort, { once: true });
      cleanup = () => {
        unsubscribe();
        clearInterval(reconcile);
        clearInterval(heartbeat);
        signal.removeEventListener("abort", onAbort);
      };
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, { headers: PRODUCT_EVENT_SSE_HEADERS });
}
