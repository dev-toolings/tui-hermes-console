import { randomUUID } from "node:crypto";
import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import { HermesRuntimeError } from "@/modules/runtime/hermes-adapter";
import { resolveAvailableRuntimeModelSelection } from "@/modules/runtime/available-model-selection";
import {
  hermesCommandFailure,
  startHermesCommand,
  type HermesCommandSession,
} from "@/modules/runtime/local-management";

type AuthStatus = "starting" | "pending" | "connected" | "failed" | "cancelled";
type AuthSession = {
  id: string;
  process: HermesCommandSession;
  status: AuthStatus;
  verificationUri: string | null;
  userCode: string | null;
  error: string | null;
  errorCode: string | null;
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
    cleanupExpiredSessions();

    const existing = [...authSessions.values()].find(
      (session) => session.status === "starting" || session.status === "pending",
    );
    if (existing) return Response.json(toPublicSession(existing));

    const id = randomUUID();
    const child = await startHermesCommand(
      ["auth", "add", "openai-codex", "--no-browser"],
      { pseudoTerminal: true },
    );
    const session: AuthSession = {
      id,
      process: child,
      status: "starting",
      verificationUri: null,
      userCode: null,
      error: null,
      errorCode: null,
      output: "",
      startedAt: Date.now(),
      expiresAt: Date.now() + 16 * 60_000,
    };
    authSessions.set(id, session);

    const onOutput = (chunk: string) => {
      session.output = stripAnsi(`${session.output}${chunk}`).slice(-20_000);
      session.verificationUri =
        session.output.match(/https:\/\/auth\.openai\.com\/codex\/device\b/i)?.[0] ??
        session.verificationUri;
      session.userCode =
        session.output.match(/\b[A-Z0-9]{4,}(?:-[A-Z0-9]{4,})+\b/)?.[0] ??
        session.userCode;
      if (session.verificationUri && session.userCode) session.status = "pending";
    };
    child.onOutput(({ chunk }) => onOutput(chunk));
    void child.result
      .then(async ({ code, stdout, stderr }) => {
        if (session.status === "cancelled") return;
        if (code === 0) {
          await activateAvailableModelAfterCodexAuth();
          session.status = "connected";
          session.error = null;
          session.errorCode = null;
        } else {
          const failure = hermesCommandFailure({
            code,
            stdout,
            stderr,
          });
          session.status = "failed";
          session.error = failure.message;
          session.errorCode = failure.code;
        }
      })
      .catch((error: unknown) => {
        if (session.status === "cancelled") return;
        session.status = "failed";
        session.error =
          error instanceof HermesRuntimeError
            ? error.message
            : "Impossible de suivre l’autorisation Hermes.";
        session.errorCode =
          error instanceof HermesRuntimeError ? error.code : "HERMES_CLI_FAILED";
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
      session.errorCode = null;
      session.process.kill();
    }
    return Response.json(toPublicSession(session));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

async function activateAvailableModelAfterCodexAuth() {
  try {
    await resolveAvailableRuntimeModelSelection({
      preferredProvider: "openai-codex",
      repairPersisted: true,
    });
  } catch {
    // L’authentification reste valide même si le catalogue n’est pas encore
    // disponible pour réparer la sélection globale. Le prochain refresh ou
    // le resolver de run réessaiera avec le provider authentifié.
  }
}

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [id, session] of authSessions) {
    if (session.expiresAt > now) continue;
    if (session.status === "starting" || session.status === "pending") {
      session.status = "cancelled";
      session.process.kill();
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
    errorCode: session.errorCode,
  };
}

function stripAnsi(value: string) {
  return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
}
