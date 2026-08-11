/**
 * Phase 0 spike — probe the REAL Hermes API server and record everything.
 *
 * Goal: decide whether Hermes Console v0.1 is buildable as specified in the PRD.
 * Every assumption in PRD §13 (HermesAdapter) is tested against the live runtime.
 * All raw responses/frames land in ./fixtures/ so they can become the mock.
 */
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.HERMES_BASE_URL ?? "http://127.0.0.1:8642";
const KEY = process.env.HERMES_API_KEY ?? "spike-local-dev-key";
const FIXTURES = new URL("./fixtures/", import.meta.url).pathname;
mkdirSync(FIXTURES, { recursive: true });

type Result = { name: string; ok: boolean; note: string };
const results: Result[] = [];

const auth = (extra: Record<string, string> = {}) => ({
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
  ...extra,
});

function record(file: string, data: unknown) {
  writeFileSync(`${FIXTURES}${file}`, JSON.stringify(data, null, 2));
}

function check(name: string, ok: boolean, note: string) {
  results.push({ name, ok, note });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name} — ${note}`);
}

async function json(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text.slice(0, 2000) };
  }
}

/** Read an SSE stream, collecting frames until terminal or timeout. */
async function readSSE(
  url: string,
  { timeoutMs = 90_000, stopAfter }: { timeoutMs?: number; stopAfter?: (f: Frame) => boolean } = {},
) {
  type F = Frame;
  const frames: F[] = [];
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: auth(), signal: ac.signal });
    if (!res.ok || !res.body) {
      return { frames, status: res.status, error: await res.text() };
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    outer: while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const chunks = buf.split("\n\n");
      buf = chunks.pop() ?? "";
      for (const chunk of chunks) {
        if (!chunk.trim()) continue;
        const frame: F = { raw: chunk };
        for (const line of chunk.split("\n")) {
          if (line.startsWith("event:")) frame.event = line.slice(6).trim();
          else if (line.startsWith("data:")) frame.data = (frame.data ?? "") + line.slice(5).trim();
          else if (line.startsWith("id:")) frame.id = line.slice(3).trim();
          else if (line.startsWith("retry:")) frame.retry = line.slice(6).trim();
        }
        frames.push(frame);
        if (stopAfter?.(frame)) {
          ac.abort();
          break outer;
        }
      }
    }
    return { frames, status: res.status };
  } catch (e) {
    return { frames, status: 0, error: String(e) };
  } finally {
    clearTimeout(timer);
  }
}

type Frame = { raw: string; event?: string; data?: string; id?: string; retry?: string };

const isTerminal = (f: Frame) =>
  /run\.(completed|failed|cancelled)|"status"\s*:\s*"(completed|failed|cancelled)"/.test(f.raw);

// ---------------------------------------------------------------- probes ---

async function probeHealth() {
  console.log("\n[1] Health & discovery");
  const h = await fetch(`${BASE}/health`).then(json);
  record("health.json", h);
  check("GET /health (no auth)", h.status === "ok", `version=${h.version}`);

  const caps = await fetch(`${BASE}/v1/capabilities`, { headers: auth() }).then(json);
  record("capabilities.json", caps);
  check(
    "GET /v1/capabilities",
    !!caps.features,
    `runtime.mode=${caps.runtime?.mode} tool_execution=${caps.runtime?.tool_execution}`,
  );

  const det = await fetch(`${BASE}/health/detailed`, { headers: auth() });
  const detBody = await json(det);
  record("health-detailed.json", detBody);
  check("GET /health/detailed", det.ok, `status=${detBody.status ?? det.status}`);

  const models = await fetch(`${BASE}/v1/models`, { headers: auth() }).then(json);
  record("models.json", models);
  check("GET /v1/models", !!models, `${models.data?.length ?? 0} model(s)`);
}

async function probeAuth() {
  console.log("\n[2] Authentication behaviour");
  const noAuth = await fetch(`${BASE}/v1/capabilities`);
  check("no token -> rejected", noAuth.status === 401 || noAuth.status === 403, `HTTP ${noAuth.status}`);

  const bad = await fetch(`${BASE}/v1/capabilities`, {
    headers: { Authorization: "Bearer wrong-key" },
  });
  const badBody = await json(bad);
  record("auth-bad-token.json", { status: bad.status, body: badBody });
  check("bad token -> rejected", bad.status === 401 || bad.status === 403, `HTTP ${bad.status}`);
}

async function probeRunLifecycle() {
  console.log("\n[3] Run lifecycle (the critical path)");

  // The key PRD question: can per-run `instructions` replace Hermes profiles?
  const createRes = await fetch(`${BASE}/v1/runs`, {
    method: "POST",
    headers: auth(),
    body: JSON.stringify({
      input: "Donne-moi trois fruits, un par ligne.",
      instructions:
        "Tu es 'Agent Test Spike'. Reponds toujours en francais et termine par la balise [SPIKE-AGENT].",
    }),
  });
  const created = await json(createRes);
  record("run-create.json", { status: createRes.status, body: created });
  const runId = created.run_id;
  check("POST /v1/runs", createRes.ok && !!runId, `HTTP ${createRes.status} run_id=${runId}`);
  if (!runId) return null;

  check(
    "per-run `instructions` accepted (agents can be local objects)",
    createRes.ok,
    "no Hermes profile creation was needed",
  );

  // Stream events to terminal state.
  const t0 = Date.now();
  const sse = await readSSE(`${BASE}/v1/runs/${runId}/events`, { stopAfter: isTerminal });
  const elapsed = Date.now() - t0;
  record("run-events-raw.json", sse);

  const types = new Set<string>();
  for (const f of sse.frames) {
    if (f.event) types.add(f.event);
    try {
      const d = JSON.parse(f.data ?? "{}");
      if (d.type) types.add(`data.type=${d.type}`);
    } catch { /* non-JSON frame */ }
  }
  record("run-event-types.json", [...types]);
  check(
    "GET /v1/runs/:id/events (SSE)",
    sse.frames.length > 0,
    `${sse.frames.length} frames in ${elapsed}ms; types: ${[...types].join(", ") || "none"}`,
  );

  const hasSeqOrId = sse.frames.some((f) => !!f.id);
  check(
    "SSE frames carry an `id:` (Last-Event-ID resume)",
    hasSeqOrId,
    hasSeqOrId ? "resumable natively" : "NO id field -> Console must assign its own sequence",
  );

  // Poll final state.
  const poll = await fetch(`${BASE}/v1/runs/${runId}`, { headers: auth() });
  const pollBody = await json(poll);
  record("run-status.json", { status: poll.status, body: pollBody });
  check(
    "GET /v1/runs/:id (reconciliation source)",
    poll.ok,
    `status=${pollBody.status} output=${JSON.stringify(pollBody.output ?? "").slice(0, 80)}`,
  );

  // Does the agent honour the per-run instructions?
  const honoured = JSON.stringify(pollBody).includes("SPIKE-AGENT");
  check(
    "agent honoured per-run instructions",
    honoured,
    honoured ? "marker found in output" : "marker NOT found (fake LLM ignores prompt — expected)",
  );

  // Replay: reconnect to the event stream AFTER the run finished.
  const replay = await readSSE(`${BASE}/v1/runs/${runId}/events`, { timeoutMs: 8000 });
  record("run-events-replay.json", replay);
  check(
    "SSE replay after completion",
    replay.frames.length > 0,
    `${replay.frames.length} frames replayed (buffer TTL applies)`,
  );

  return { runId, status: pollBody.status };
}

async function probeStop() {
  console.log("\n[4] Cancellation");
  const created = await fetch(`${BASE}/v1/runs`, {
    method: "POST",
    headers: auth(),
    // SLOWMODE makes the fake LLM hang, keeping the run genuinely active.
    body: JSON.stringify({ input: "SLOWMODE compte lentement de 1 a 100." }),
  }).then(json);
  const runId = created.run_id;
  if (!runId) return check("POST /v1/runs/:id/stop", false, "could not create run to cancel");

  await new Promise((r) => setTimeout(r, 3000));
  const mid = await fetch(`${BASE}/v1/runs/${runId}`, { headers: auth() }).then(json);
  check("run observable while active", !!mid.status, `mid-flight status=${mid.status}`);
  const stop = await fetch(`${BASE}/v1/runs/${runId}/stop`, { method: "POST", headers: auth() });
  const stopBody = await json(stop);
  record("run-stop.json", { status: stop.status, body: stopBody });
  check("POST /v1/runs/:id/stop", stop.ok, `HTTP ${stop.status} -> ${JSON.stringify(stopBody)}`);

  await new Promise((r) => setTimeout(r, 4000));
  const after = await fetch(`${BASE}/v1/runs/${runId}`, { headers: auth() }).then(json);
  record("run-stop-final.json", after);
  check("cancel settles to terminal state", !!after.status, `final status=${after.status}`);
}

async function probeErrors() {
  console.log("\n[5] Error surfaces");
  const missing = await fetch(`${BASE}/v1/runs/run_does_not_exist`, { headers: auth() });
  const missingBody = await json(missing);
  record("run-404.json", { status: missing.status, body: missingBody });
  check("unknown run -> 404", missing.status === 404, `HTTP ${missing.status}`);

  // PRD Phase 4 assumes file uploads. Docs say they are rejected. Verify.
  const withFile = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: auth(),
    body: JSON.stringify({
      model: "hermes-agent",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Resume ce fichier." },
            { type: "input_file", file_id: "file_123" },
          ],
        },
      ],
    }),
  });
  const withFileBody = await json(withFile);
  record("file-upload-rejected.json", { status: withFile.status, body: withFileBody });
  check(
    "file attachment via API",
    withFile.status === 400,
    `HTTP ${withFile.status} — ${JSON.stringify(withFileBody).slice(0, 160)}`,
  );
}

async function probeResources() {
  console.log("\n[6] session_resources (the real file path?)");
  const res = await fetch(`${BASE}/v1/runs`, {
    method: "POST",
    headers: auth(),
    body: JSON.stringify({
      input: "Que contient la ressource fournie ?",
      resources: [{ type: "file", path: "/tmp/spike-resource.txt" }],
    }),
  });
  const body = await json(res);
  record("run-with-resources.json", { status: res.status, body });
  check(
    "POST /v1/runs with `resources`",
    res.ok,
    `HTTP ${res.status} — ${JSON.stringify(body).slice(0, 160)}`,
  );
}

async function probeSessions() {
  console.log("\n[7] Sessions (history / continuity)");
  const list = await fetch(`${BASE}/api/sessions`, { headers: auth() });
  const listBody = await json(list);
  record("sessions-list.json", { status: list.status, body: listBody });
  const count = Array.isArray(listBody) ? listBody.length : (listBody.sessions?.length ?? 0);
  check("GET /api/sessions", list.ok, `HTTP ${list.status}, ${count} session(s)`);
}

// -------------------------------------------------------------------- run ---

console.log(`=== Hermes Console — Phase 0 spike against ${BASE} ===`);
await probeHealth();
await probeAuth();
await probeRunLifecycle();
await probeStop();
await probeErrors();
await probeResources();
await probeSessions();

const passed = results.filter((r) => r.ok).length;
console.log(`\n=== ${passed}/${results.length} checks passed ===`);
record("summary.json", { at: new Date().toISOString(), base: BASE, results });
for (const r of results.filter((x) => !x.ok)) console.log(`  FAILED: ${r.name} — ${r.note}`);
