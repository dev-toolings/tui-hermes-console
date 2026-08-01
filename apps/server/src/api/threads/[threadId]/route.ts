import { apiErrorResponse } from "@/modules/api/errors";
import { getSessionConnectorGaps } from "@/modules/session/execute-command";
import { deleteThread } from "@/modules/runs/delete-thread";
import { getThreadSnapshot } from "@/modules/runs/repository";
import { resolveHermesRuntimeConfig } from "@/modules/runtime/config";
import { getHermesSession } from "@/modules/runtime/hermes-adapter";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";
import { z } from "zod";

const threadIdSchema = z.string().trim().min(1).max(200);

export async function GET(
  _request: Request,
  context: AuthenticatedRouteContext<{ threadId: string }>,
) {
  try {
    const { threadId: rawThreadId } = await context.params;
    const threadId = threadIdSchema.parse(rawThreadId);
    const thread = await getThreadSnapshot(context.siteContext, threadId);
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
      connectorGaps: await getSessionConnectorGaps(context.siteContext, threadId),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  context: AuthenticatedRouteContext<{ threadId: string }>,
  dependencies: { delete: typeof deleteThread } = { delete: deleteThread },
) {
  try {
    const { threadId: rawThreadId } = await context.params;
    const threadId = threadIdSchema.parse(rawThreadId);
    const result = await dependencies.delete(context.siteContext, threadId);
    return Response.json({ deleted: true, ...result });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
