/**
 * Fake OpenAI-compatible LLM server (Hono).
 *
 * Hermes is pointed at this via OLLAMA_BASE_URL so the agent loop can complete
 * end-to-end without any paid provider key. It answers every prompt with a
 * canned assistant message and logs what Hermes actually sends.
 */
import { Hono } from "hono";
import { appendFileSync, mkdirSync } from "node:fs";

const PORT = 8787;
const LOG = new URL("./fixtures/fake-llm-requests.jsonl", import.meta.url).pathname;
mkdirSync(new URL("./fixtures/", import.meta.url).pathname, { recursive: true });

const app = new Hono();

const REPLY =
  "Spike OK. Trois fruits : pomme, banane, cerise.";

app.get("/v1/models", (c) =>
  c.json({
    object: "list",
    data: [{ id: "fake-local", object: "model", owned_by: "spike" }],
  }),
);

const FULL = new URL("./fixtures/fake-llm-full-bodies.jsonl", import.meta.url).pathname;

app.post("/v1/chat/completions", async (c) => {
  const body = await c.req.json();
  // Full, untruncated dump: needed to prove whether per-run `instructions`
  // actually reach the model (Hermes' own system prompt is several KB).
  appendFileSync(FULL, JSON.stringify({ at: new Date().toISOString(), body }) + "\n");
  appendFileSync(
    LOG,
    JSON.stringify({
      at: new Date().toISOString(),
      model: body.model,
      stream: !!body.stream,
      messageCount: body.messages?.length ?? 0,
      toolCount: body.tools?.length ?? 0,
      systemLen: String(body.messages?.[0]?.content ?? "").length,
      lastUser: JSON.stringify(body.messages?.at(-1) ?? null).slice(0, 2000),
    }) + "\n",
  );

  // Slow mode: lets the cancellation probe catch a run while it is still active.
  if (JSON.stringify(body.messages ?? []).includes("SLOWMODE")) {
    await new Promise((r) => setTimeout(r, 30_000));
  }

  const id = `chatcmpl-spike-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  const model = body.model ?? "fake-local";

  if (!body.stream) {
    return c.json({
      id,
      object: "chat.completion",
      created,
      model,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: REPLY },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
    });
  }

  // Streaming: emit the reply in small deltas so Hermes produces assistant.delta events.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      send({
        id,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
      });

      for (const piece of REPLY.match(/.{1,12}/g) ?? []) {
        send({
          id,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [{ index: 0, delta: { content: piece }, finish_reason: null }],
        });
      }

      send({
        id,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
      });

      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});

app.all("*", async (c) => {
  appendFileSync(
    LOG,
    JSON.stringify({ at: new Date().toISOString(), unhandled: c.req.path, method: c.req.method }) + "\n",
  );
  return c.json({ error: { message: `unhandled ${c.req.path}` } }, 404);
});

console.log(`[fake-llm] listening on http://127.0.0.1:${PORT}`);
export default { port: PORT, hostname: "127.0.0.1", fetch: app.fetch };
