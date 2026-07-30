import { apiErrorResponse } from "@/modules/api/errors";
import { getSessionConnectorGaps } from "@/modules/session/execute-command";
import { deleteThread } from "@/modules/runs/delete-thread";
import { getThreadSnapshot } from "@/modules/runs/repository";
import { resolveHermesRuntimeConfig } from "@/modules/runtime/config";
import { getHermesSession } from "@/modules/runtime/hermes-adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ threadId: string }> },
) {
  try {
    const { threadId } = await context.params;
    const thread = await getThreadSnapshot(threadId);
    if (!thread) {
      return Response.json(
        { error: { code: "THREAD_NOT_FOUND", message: "Conversation introuvable." } },
        { status: 404 },
      );
    }

    const latestRun = thread.runs.at(-1);
    if (latestRun?.hermesResponseId) {
      try {
        const runtime = await resolveHermesRuntimeConfig();
        latestRun.runtimeSession = await getHermesSession(
          runtime,
          latestRun.hermesResponseId,
        );
      } catch {
        // Le snapshot Postgres reste lisible si la session Hermes a expiré
        // ou si le runtime est momentanément indisponible.
      }
    }

    return Response.json({
      thread,
      connectorGaps: await getSessionConnectorGaps(threadId),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ threadId: string }> },
) {
  try {
    const { threadId } = await context.params;
    const result = await deleteThread(threadId);
    return Response.json({ deleted: true, ...result });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
