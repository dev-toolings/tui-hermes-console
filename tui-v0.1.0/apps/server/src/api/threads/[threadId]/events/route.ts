import { apiErrorResponse } from "@/modules/api/errors";
import { createProductEventStream } from "@/modules/runs/product-event-sse";
import { getThreadSnapshot } from "@/modules/runs/repository";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";
import { z } from "zod";

export async function GET(
  request: Request,
  context: AuthenticatedRouteContext<{ threadId: string }>,
  dependencies: { stream: typeof createProductEventStream } = {
    stream: createProductEventStream,
  },
) {
  try {
    const { threadId: rawThreadId } = await context.params;
    const threadId = z.string().trim().min(1).max(200).parse(rawThreadId);
    const snapshot = await getThreadSnapshot(context.siteContext, threadId);
    if (!snapshot) {
      return Response.json(
        { error: { code: "THREAD_NOT_FOUND", message: "Conversation introuvable." } },
        { status: 404 },
      );
    }

    const requestedCursor = Number(
      request.headers.get("last-event-id") ??
        new URL(request.url).searchParams.get("cursor") ??
        "0",
    );
    const cursor =
      Number.isSafeInteger(requestedCursor) && requestedCursor >= 0 ? requestedCursor : 0;

    return dependencies.stream({
      context: context.siteContext,
      threadId,
      cursor,
      signal: request.signal,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
