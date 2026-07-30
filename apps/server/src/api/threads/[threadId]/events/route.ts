import { apiErrorResponse } from "@/modules/api/errors";
import { createProductEventStream } from "@/modules/runs/product-event-sse";
import { getThreadSnapshot } from "@/modules/runs/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ threadId: string }> },
) {
  try {
    const { threadId } = await context.params;
    const snapshot = await getThreadSnapshot(threadId);
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

    return createProductEventStream({
      threadId,
      cursor,
      signal: request.signal,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
