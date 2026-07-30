import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import { resolveHermesRuntimeConfig } from "@/modules/runtime/config";
import { HermesRuntimeError } from "@/modules/runtime/hermes-adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AuthStatus = "starting" | "pending" | "connected" | "failed" | "cancelled";
type AuthSession = {
  id: string;
  process: ChildProcessWithoutNullStreams;
  status: AuthStatus;
  verificationUri: string | null;
  userCode: string | null;
  error: string | null;
  output: string;
  startedAt: number;
  expiresAt: number;
};

const sessionQuerySchema = z.object({
  sessionId: z.string().uuid(),
});

const globalAuth = globalThis as typeof globalThis & {
  hermesConsoleCodexAuthSessions?: Map<string, AuthSession>;
};
const authSessions =
  globalAuth.hermesConsoleCodexAuthSessions ??
  (globalAuth.hermesConsoleCodexAuthSessions = new Map<string, AuthSession>());

export async function POST() {
  try {
    await assertLocalHermesRuntime();
    cleanupExpiredSessions();

    const existing = [...authSessions.values()].find(
      (session) => session.status === "starting" || session.status === "pending",
    );
    if (existing) return Response.json(toPublicSession(existing));

    const id = randomUUID();
    const child = spawn(
      "hermes",
      ["auth", "add", "openai-codex", "--no-browser"],
      {
        env: {
          ...process.env,
          NO_COLOR: "1",
          PYTHONUNBUFFERED: "1",
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    const session: AuthSession = {
      id,
      process: child,
      status: "starting",
      verificationUri: null,
      userCode: null,
      error: null,
      output: "",
      startedAt: Date.now(),
      expiresAt: Date.now() + 16 * 60_000,
    };
    authSessions.set(id, session);

    const onOutput = (chunk: Buffer) => {
      session.output = stripAnsi(`${session.output}${chunk.toString("utf8")}`).slice(-20_000);
      session.verificationUri =
        session.output.match(/https:\/\/auth\.openai\.com\/codex\/device\b/i)?.[0] ??
        session.verificationUri;
      session.userCode =
        session.output.match(/\b[A-Z0-9]{4,}(?:-[A-Z0-9]{4,})+\b/)?.[0] ??
        session.userCode;
      if (session.verificationUri && session.userCode) session.status = "pending";
    };
    child.stdout.on("data", onOutput);
    child.stderr.on("data", onOutput);
    child.on("error", (error) => {
      session.status = "failed";
      session.error = `Impossible de démarrer Hermes CLI (${error.message}).`;
    });
    child.on("exit", (code, signal) => {
      if (session.status === "cancelled") return;
      if (code === 0) {
        session.status = "connected";
        session.error = null;
      } else {
        session.status = "failed";
        session.error =
          signal === "SIGTERM"
            ? "Connexion OpenAI annulée."
            : extractSafeError(session.output) ??
              `Hermes CLI a quitté le flux d’autorisation (code ${code ?? "inconnu"}).`;
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 250));
    return Response.json(toPublicSession(session), { status: 202 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    cleanupExpiredSessions();
    const input = sessionQuerySchema.parse({
      sessionId: new URL(request.url).searchParams.get("sessionId"),
    });
    const session = authSessions.get(input.sessionId);
    if (!session) {
      throw new HermesRuntimeError(
        "Cette autorisation OpenAI n’existe plus.",
        404,
        "OPENAI_CODEX_AUTH_SESSION_NOT_FOUND",
      );
    }
    return Response.json(toPublicSession(session));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const input = sessionQuerySchema.parse({
      sessionId: new URL(request.url).searchParams.get("sessionId"),
    });
    const session = authSessions.get(input.sessionId);
    if (!session) return new Response(null, { status: 204 });

    if (session.status === "starting" || session.status === "pending") {
      session.status = "cancelled";
      session.error = null;
      session.process.kill("SIGTERM");
    }
    return Response.json(toPublicSession(session));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

async function assertLocalHermesRuntime() {
  const config = await resolveHermesRuntimeConfig();
  // Cf. assertLocalHermesRuntime : en mode tunnel, 127.0.0.1 n'est pas la machine d'Hermes.
  const hostname =
    config.transport === "ssh" ? "remote" : new URL(config.baseUrl).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(hostname)) {
    throw new HermesRuntimeError(
      "Le runtime Hermes est distant et n’expose pas son API OAuth. Lancez `hermes auth add openai-codex` sur cette machine.",
      501,
      "HERMES_REMOTE_OAUTH_UNAVAILABLE",
    );
  }
}

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [id, session] of authSessions) {
    if (session.expiresAt > now) continue;
    if (session.status === "starting" || session.status === "pending") {
      session.status = "cancelled";
      session.process.kill("SIGTERM");
    }
    authSessions.delete(id);
  }
}

function toPublicSession(session: AuthSession) {
  return {
    sessionId: session.id,
    status: session.status,
    verificationUri: session.verificationUri,
    userCode: session.userCode,
    startedAt: new Date(session.startedAt).toISOString(),
    expiresAt: new Date(session.expiresAt).toISOString(),
    error: session.error,
  };
}

function stripAnsi(value: string) {
  return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
}

function extractSafeError(output: string) {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.toLowerCase().includes("token"))
    .slice(-3);
  return lines.length > 0 ? lines.join(" ").slice(0, 500) : null;
}
