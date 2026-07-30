/**
 * Phase 0c — trigger and resolve a real approval.
 *
 * Source (gateway/platforms/api_server.py:6243-6266) shows the runtime emits an
 * `approval.request` event, moves the run to status `waiting_for_approval`, and
 * waits for POST /v1/runs/{id}/approval. Approvals only fire on commands the
 * runtime flags as dangerous, so this probe asks for a deletion of a throwaway
 * temp file — and DENIES it, so nothing is actually destroyed.
 */
import { writeFileSync, existsSync, mkdirSync } from "node:fs";

const BASE = process.env.HERMES_BASE_URL ?? "http://127.0.0.1:8642";
const KEY = process.env.HERMES_API_KEY ?? "spike-local-dev-key";
const FIXTURES = new URL("./fixtures/", import.meta.url).pathname;
mkdirSync(FIXTURES, { recursive: true });
const auth = () => ({ Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" });

const VICTIM = "/tmp/hermes-spike-deleteme.txt";
writeFileSync(VICTIM, "fichier jetable du spike — sa suppression doit etre refusee\n");
console.log(`=== Phase 0c — approval flow ===\ntemp file created: ${VICTIM}\n`);

const created = await fetch(`${BASE}/v1/runs`, {
  method: "POST",
  headers: auth(),
  body: JSON.stringify({
    input: `Supprime le fichier ${VICTIM} en utilisant la commande shell rm. Sois bref.`,
  }),
}).then((r) => r.json());

const runId = created.run_id;
console.log(`run: ${runId}`);

type Ev = { event: string; [k: string]: unknown };
const events: Ev[] = [];
let approvalEvent: Ev | null = null;
let responded = false;

const ac = new AbortController();
const timer = setTimeout(() => ac.abort(), 120_000);

try {
  const res = await fetch(`${BASE}/v1/runs/${runId}/events`, { headers: auth(), signal: ac.signal });
  const reader = res.body!.getReader();
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
      console.log(`  <- ${ev.event}`);

      if (ev.event === "approval.request" && !responded) {
        responded = true;
        approvalEvent = ev;
        console.log("\n  APPROVAL REQUESTED — full payload:");
        console.log("  " + JSON.stringify(ev, null, 2).split("\n").join("\n  "));

        const status = await fetch(`${BASE}/v1/runs/${runId}`, { headers: auth() }).then((r) =>
          r.json(),
        );
        console.log(`\n  run status while blocked: ${status.status}`);

        // Deny. Nothing gets deleted.
        const deny = await fetch(`${BASE}/v1/runs/${runId}/approval`, {
          method: "POST",
          headers: auth(),
          body: JSON.stringify({ approved: false, choice: "deny" }),
        });
        console.log(`  POST /approval {approved:false} -> HTTP ${deny.status} ${await deny.text()}`);
      }

      if (/^run\.(completed|failed|cancelled)$/.test(ev.event)) {
        ac.abort();
        break outer;
      }
    }
  }
} catch {
  /* aborted */
} finally {
  clearTimeout(timer);
}

const final = await fetch(`${BASE}/v1/runs/${runId}`, { headers: auth() }).then((r) => r.json());
const survived = existsSync(VICTIM);

console.log(`\nfinal status: ${final.status}`);
console.log(`output: ${JSON.stringify(final.output ?? "").slice(0, 300)}`);
console.log(`temp file still exists: ${survived ? "YES (deletion refused)" : "NO — it was deleted"}`);
console.log(`approval fired: ${approvalEvent ? "YES" : "NO (command not flagged dangerous)"}`);

writeFileSync(
  `${FIXTURES}approval-flow.json`,
  JSON.stringify({ runId, approvalEvent, events, final, fileSurvived: survived }, null, 2),
);
console.log("\nfixture: spike/fixtures/approval-flow.json");
