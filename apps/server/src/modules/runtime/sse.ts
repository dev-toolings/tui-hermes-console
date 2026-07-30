import type { HermesEvent } from "@console/core/lib/hermes-events";

export type ServerSentEvent = {
  event: string;
  data: Record<string, unknown>;
};

export async function* parseServerSentEvents(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<ServerSentEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done }).replaceAll("\r\n", "\n");

      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");

        const parsed = parseFrame(frame);
        if (parsed) yield parsed;
      }

      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
}

/** SSE `/v1/runs/:id/events` — le type d’événement est dans le JSON (`data.event`). */
export async function* parseHermesAgentEvents(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<HermesEvent> {
  for await (const frame of parseServerSentEvents(stream)) {
    const event = frame.data.event;
    if (typeof event !== "string") continue;
    yield frame.data as HermesEvent;
  }
}

function parseFrame(frame: string): ServerSentEvent | null {
  let event = "message";
  const dataLines: string[] = [];

  for (const line of frame.split("\n")) {
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }

  if (dataLines.length === 0 || dataLines[0] === "[DONE]") return null;

  try {
    return {
      event,
      data: JSON.parse(dataLines.join("\n")) as Record<string, unknown>,
    };
  } catch {
    return { event: "invalid", data: { raw: dataLines.join("\n") } };
  }
}
