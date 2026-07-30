import { describe, expect, test } from "bun:test";
import { parseServerSentEvents } from "./sse";

describe("parseServerSentEvents", () => {
  test("recompose les frames coupées entre plusieurs chunks", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("event: response.output_text.delta\r\ndata: {\"type\":\"response."));
        controller.enqueue(encoder.encode("output_text.delta\",\"delta\":\"bonjour\"}\r\n\r\n"));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    const events = [];
    for await (const event of parseServerSentEvents(stream)) events.push(event);

    expect(events).toEqual([
      {
        event: "response.output_text.delta",
        data: { type: "response.output_text.delta", delta: "bonjour" },
      },
    ]);
  });
});
