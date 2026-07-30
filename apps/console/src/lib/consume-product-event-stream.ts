import type { StoredProductEvent } from "@console/core/modules/runs/types";

export type ProductEventStreamHandlers = {
  onMeta?: (payload: { threadId: string; runId: string }) => void;
  onEvent: (event: StoredProductEvent) => void;
};

export async function consumeProductEventStream(
  response: Response,
  handlers: ProductEventStreamHandlers,
) {
  if (!response.body) {
    throw new Error("Flux SSE vide.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const dispatchBlock = (block: string) => {
    const lines = block.split("\n");
    let eventName = "message";
    const dataLines: string[] = [];

    for (const line of lines) {
      if (!line || line.startsWith(":")) continue;
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
        continue;
      }
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }
    }

    if (dataLines.length === 0) return;
    const payload = JSON.parse(dataLines.join("\n")) as unknown;

    if (eventName === "run.meta") {
      handlers.onMeta?.(payload as { threadId: string; runId: string });
      return;
    }

    if (eventName === "run.event") {
      handlers.onEvent(payload as StoredProductEvent);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      dispatchBlock(block);
      boundary = buffer.indexOf("\n\n");
    }
  }

  if (buffer.trim()) dispatchBlock(buffer);
}
