import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

function fixtureAssert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Hermes G1-007A fixture: ${message}`);
}

type FakeRun = {
  hermesRunId: string;
  consoleRunId: string | null;
  decision: "once" | "deny" | null;
  approvalEmitted: boolean;
};

export class HermesG1A007AFixture {
  readonly server: ReturnType<typeof Bun.serve>;
  readonly runs = new Map<string, FakeRun>();
  readonly approvalCalls: Array<{ hermesRunId: string; choice: string; receivedAt: number }> = [];
  dangerousEffectCount = 0;
  private runCounter = 0;

  constructor(private readonly sharedWorkdir: string) {
    this.server = Bun.serve({
      port: 0,
      fetch: (request) => this.handle(request),
    });
  }

  get baseUrl() {
    return `http://127.0.0.1:${this.server.port}`;
  }

  get latestRunId() {
    return [...this.runs.keys()].at(-1) ?? null;
  }

  bindConsoleRun(hermesRunId: string, consoleRunId: string) {
    const run = this.runs.get(hermesRunId);
    fixtureAssert(run, `run Hermes ${hermesRunId} introuvable`);
    run.consoleRunId = consoleRunId;
  }

  stop() {
    this.server.stop(true);
  }

  private async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (pathname === "/health" && request.method === "GET") {
      return Response.json({ status: "ok", fixture: "g1-007a" });
    }
    if (pathname === "/v1/capabilities" && request.method === "GET") {
      return Response.json({ platform: "fixture", features: { approvals: true, sessions: true } });
    }

    if (pathname === "/api/sessions" && request.method === "POST") {
      return Response.json({ ok: true }, { status: 201 });
    }
    if (pathname.startsWith("/api/sessions/") && pathname.endsWith("/messages")) {
      return Response.json({ data: [] });
    }
    if (pathname.startsWith("/api/sessions/") && request.method === "GET") {
      const id = decodeURIComponent(pathname.slice("/api/sessions/".length));
      return Response.json({ session: { id, model: "fixture-model", reasoning_tokens: 0, tool_call_count: 0 } });
    }

    if (pathname === "/v1/runs" && request.method === "POST") {
      const hermesRunId = `hermes-g1-007a-${++this.runCounter}`;
      this.runs.set(hermesRunId, {
        hermesRunId,
        consoleRunId: null,
        decision: null,
        approvalEmitted: false,
      });
      return Response.json({ run_id: hermesRunId }, { status: 200 });
    }

    const match = pathname.match(/^\/v1\/runs\/([^/]+)(?:\/([^/]+))?$/);
    if (!match) return Response.json({ error: "not found" }, { status: 404 });
    const hermesRunId = decodeURIComponent(match[1]!);
    const action = match[2] ?? null;
    const run = this.runs.get(hermesRunId);
    if (!run) return Response.json({ error: "run not found" }, { status: 404 });

    if (!action && request.method === "GET") {
      return Response.json({
        object: "run",
        run_id: hermesRunId,
        status: run.decision ? "completed" : "waiting_for_approval",
        output: run.decision === "deny" ? "Mission refusée" : run.decision ? "Mission exécutée" : null,
        usage: run.decision ? { input_tokens: 4, output_tokens: 3, total_tokens: 7 } : null,
      });
    }

    if (action === "events" && request.method === "GET") {
      const timestamp = Date.now() / 1_000;
      const events = run.decision
        ? [
            {
              event: "message.delta",
              run_id: hermesRunId,
              timestamp,
              delta: run.decision === "deny" ? "Refusé sans effet." : "Mission exécutée.",
            },
            {
              event: "run.completed",
              run_id: hermesRunId,
              timestamp: timestamp + 0.01,
              output: run.decision === "deny" ? "Mission refusée" : "Mission exécutée",
              usage: { input_tokens: 4, output_tokens: 3, total_tokens: 7 },
            },
          ]
        : run.approvalEmitted
          ? []
          : [
              {
                event: "approval.request",
                run_id: hermesRunId,
                timestamp,
                command: "touch /protected/effect",
                choices: ["once", "deny"],
                description: "[HIGH] Synthetic effect: write a protected file",
              },
            ];
      run.approvalEmitted = true;
      const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
      return new Response(body, {
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-store",
        },
      });
    }

    if (action === "approval" && request.method === "POST") {
      const body = (await request.json()) as { choice?: string };
      if (body.choice !== "once" && body.choice !== "deny") {
        return Response.json({ error: "invalid choice" }, { status: 400 });
      }
      run.decision = body.choice;
      this.approvalCalls.push({ hermesRunId, choice: body.choice, receivedAt: Date.now() });
      if (body.choice === "once") {
        this.dangerousEffectCount += 1;
        fixtureAssert(run.consoleRunId, "le run Console doit être lié avant l'approbation");
        const outputDir = join(this.sharedWorkdir, "runs", run.consoleRunId, "out");
        await mkdir(outputDir, { recursive: true });
        await writeFile(join(outputDir, "result.txt"), "artifact-bytes-g1-007a", "utf8");
      }
      return new Response(null, { status: 204 });
    }

    return Response.json({ error: "unsupported" }, { status: 404 });
  }
}
