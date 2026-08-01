import { subscribeToThread } from "./event-bus";
import { canReadThreadEvents, listThreadEventsAfter } from "./repository";
import type { StoredProductEvent } from "@console/core/modules/runs/types";
import { isTerminalProductEvent } from "@console/core/lib/thread-snapshot-mutations";
import type { SiteRequestContext } from "@/modules/auth/service";

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
  context: SiteRequestContext;
  threadId: string;
  runId?: string;
  cursor?: number;
  signal: AbortSignal;
  closeOnTerminal?: boolean;
};

export function createProductEventStream({
  context,
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
      let unsubscribe: (() => void) | undefined;
      let reconcile: ReturnType<typeof setInterval> | undefined;
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      let onAbort: (() => void) | undefined;
      cleanup = () => {
        unsubscribe?.();
        if (reconcile) clearInterval(reconcile);
        if (heartbeat) clearInterval(heartbeat);
        if (onAbort) signal.removeEventListener("abort", onAbort);
      };
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

      const sendAuthorized = async (event: StoredProductEvent) => {
        if (closed || event.cursor <= cursor) return;
        if (runId && event.runId !== runId) return;
        if (!(await canReadThreadEvents(context, threadId))) {
          close();
          return;
        }
        cursor = event.cursor;
        controller.enqueue(encoder.encode(encodeProductEventSse(event)));
        if (closeOnTerminal && isTerminalProductEvent(event)) close();
      };

      let sendQueue = Promise.resolve();
      const enqueue = (event: StoredProductEvent) => {
        sendQueue = sendQueue.then(() => sendAuthorized(event));
        return sendQueue;
      };
      const send = (event: StoredProductEvent) => {
        void enqueue(event).catch(close);
      };

      if (runId) {
        controller.enqueue(encoder.encode(encodeRunMetaSse({ threadId, runId })));
      }

      onAbort = () => close();
      signal.addEventListener("abort", onAbort, { once: true });
      unsubscribe = subscribeToThread(threadId, send);
      try {
        for (const event of await listThreadEventsAfter(context, threadId, cursor)) {
          await enqueue(event);
        }
      } catch {
        close();
        return;
      }
      if (closed) return;

      reconcile = setInterval(async () => {
        try {
          if (!(await canReadThreadEvents(context, threadId))) {
            close();
            return;
          }
          for (const event of await listThreadEventsAfter(context, threadId, cursor)) send(event);
        } catch {
          close();
        }
      }, 2_000);
      heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`));
      }, 15_000);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, { headers: PRODUCT_EVENT_SSE_HEADERS });
}
