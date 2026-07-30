/**
 * Phase 0b — probe against a REAL LLM (gpt-5.4-nano via OpenAI).
 *
 * The first spike ran on a fake model that never called a tool, so three things
 * stayed unmeasured and were flagged as open in SPIKE-REPORT.md §5:
 *   1. tool.* event frames
 *   2. delta volume (sizes the coalescing strategy)
 *   3. the shared-filesystem file model of PRD §16
 *
 * This probe closes all three. It costs a few real tokens; prompts are kept small.
 */
import { mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync } from "node:fs";

const BASE = process.env.HERMES_BASE_URL ?? "http://127.0.0.1:8642";
const KEY = process.env.HERMES_API_KEY ?? "spike-local-dev-key";
const FIXTURES = new URL("./fixtures/", import.meta.url).pathname;
const WORKROOT = "/tmp/hermes-console-spike/runs";
mkdirSync(FIXTURES, { recursive: true });

const auth = () => ({ Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" });
const rec = (f: string, d: unknown) => writeFileSync(`${FIXTURES}${f}`, JSON.stringify(d, null, 2));

type Ev = { event: string; run_id: string; timestamp: number; [k: string]: unknown };

/** Consume the SSE stream, returning every decoded runtime event. */
async function stream(runId: string, timeoutMs = 180_000) {
  const events: Ev[] = [];
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  const t0 = Date.now();
  let firstDeltaAt: number | null = null;
  try {
    const res = await fetch(`${BASE}/v1/runs/${runId}/events`, { headers: auth(), signal: ac.signal });
    if (!res.body) return { events, firstDeltaMs: null, totalMs: 0 };
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    outer: while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const p of parts) {
        const line = p.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        let ev: Ev;
        try {
          ev = JSON.parse(line.slice(5).trim());
        } catch {
          continue;
        }
        events.push(ev);
        if (ev.event === "message.delta" && firstDeltaAt === null) firstDeltaAt = Date.now();
        if (/^run\.(completed|failed|cancelled)$/.test(ev.event)) {
          ac.abort();
          break outer;
        }
      }
    }
  } catch {
    /* aborted on terminal event */
  } finally {
    clearTimeout(timer);
  }
  return {
    events,
    firstDeltaMs: firstDeltaAt ? firstDeltaAt - t0 : null,
    totalMs: Date.now() - t0,
  };
}

async function submit(body: Record<string, unknown>) {
  const res = await fetch(`${BASE}/v1/runs`, {
    method: "POST",
    headers: auth(),
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

function summarise(events: Ev[]) {
  const counts: Record<string, number> = {};
  for (const e of events) counts[e.event] = (counts[e.event] ?? 0) + 1;
  return counts;
}

// ---- 1. Tool-using run + the PRD §16 shared-filesystem file model -----------

console.log("=== Phase 0b — real model (gpt-5.4-nano) ===\n");
console.log("[A] Tool-using run + shared-workdir file round-trip");

const runDir = `${WORKROOT}/spike-${Date.now()}`;
mkdirSync(`${runDir}/in`, { recursive: true });
mkdirSync(`${runDir}/out`, { recursive: true });
writeFileSync(
  `${runDir}/in/notes.txt`,
  ["pomme: 3", "banane: 5", "cerise: 12"].join("\n"),
);

const toolRun = await submit({
  input:
    `Lis le fichier ${runDir}/in/notes.txt, additionne les nombres, ` +
    `puis ecris le total seul dans ${runDir}/out/total.txt. Sois bref.`,
  instructions: "Tu es 'Agent Fichiers'. Utilise tes outils. Termine par [SPIKE-AGENT].",
});
console.log(`  POST /v1/runs -> HTTP ${toolRun.status} ${toolRun.body.run_id}`);

const toolStream = await stream(toolRun.body.run_id);
const toolCounts = summarise(toolStream.events);
rec("real-run-events.json", toolStream.events);
rec("real-run-event-counts.json", toolCounts);

console.log(`  events: ${toolStream.events.length} in ${toolStream.totalMs}ms`);
console.log(`  first delta: ${toolStream.firstDeltaMs}ms`);
console.log("  event types:");
for (const [t, n] of Object.entries(toolCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${String(n).padStart(4)}  ${t}`);
}

const final = await fetch(`${BASE}/v1/runs/${toolRun.body.run_id}`, { headers: auth() }).then((r) =>
  r.json(),
);
rec("real-run-status.json", final);
console.log(`  final status: ${final.status}`);
console.log(`  output: ${JSON.stringify(final.output ?? "").slice(0, 200)}`);
console.log(`  usage: ${JSON.stringify(final.usage ?? null)}`);
console.log(
  `  instructions honoured: ${JSON.stringify(final).includes("SPIKE-AGENT") ? "YES" : "no"}`,
);

// Did the agent actually produce a file in the shared workdir? (PRD §16)
const outFiles = existsSync(`${runDir}/out`) ? readdirSync(`${runDir}/out`) : [];
const artifacts = outFiles.map((f) => ({
  filename: f,
  content: readFileSync(`${runDir}/out/${f}`, "utf8").slice(0, 200),
}));
rec("real-run-artifacts.json", { runDir, outFiles, artifacts });
console.log(`  files produced in out/: ${outFiles.length ? outFiles.join(", ") : "NONE"}`);
for (const a of artifacts) console.log(`    ${a.filename} -> ${JSON.stringify(a.content)}`);

// ---- 2. Delta volume on a deliberately chatty run --------------------------

console.log("\n[B] Delta volume (sizes the coalescing strategy)");
const chatty = await submit({
  input: "Ecris un paragraphe de 150 mots sur la mer. Texte seul, aucun outil.",
});
const chattyStream = await stream(chatty.body.run_id);
const chattyCounts = summarise(chattyStream.events);
rec("real-run-chatty-counts.json", {
  counts: chattyCounts,
  totalEvents: chattyStream.events.length,
  totalMs: chattyStream.totalMs,
});

const deltas = chattyStream.events.filter((e) => e.event === "message.delta");
const chars = deltas.reduce((n, e) => n + String(e.delta ?? "").length, 0);
console.log(`  ${deltas.length} message.delta for ${chars} chars in ${chattyStream.totalMs}ms`);
console.log(
  `  => ${(deltas.length / Math.max(1, chattyStream.totalMs / 1000)).toFixed(1)} deltas/s, ` +
    `avg ${(chars / Math.max(1, deltas.length)).toFixed(1)} chars/delta`,
);
console.log(`  event types: ${JSON.stringify(chattyCounts)}`);

// ---- 3. Full event shapes, for the normaliser ------------------------------

const shapes: Record<string, unknown> = {};
for (const e of [...toolStream.events, ...chattyStream.events]) {
  if (!shapes[e.event]) shapes[e.event] = e;
}
rec("real-event-shapes.json", shapes);
console.log(`\n[C] Distinct event shapes captured: ${Object.keys(shapes).join(", ")}`);

console.log("\n=== done — fixtures written to spike/fixtures/ ===");
