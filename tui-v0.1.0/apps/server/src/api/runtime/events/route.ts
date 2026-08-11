import { getActiveRuntimeUpdateOperation, isTerminalRuntimeUpdateStatus } from "@/modules/runtime/update-operations";
import { apiErrorResponse } from "@/modules/api/errors";

export async function GET(request: Request) {
  try {
    const activeOperation = await getActiveRuntimeUpdateOperation();
    if (!activeOperation) {
      return Response.json(
        { error: { code: "NOT_FOUND", message: "Aucune opération active." } },
        { status: 404 },
      );
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        let closed = false;
        const finish = () => {
          if (closed) return;
          closed = true;
          clearInterval(timer);
          controller.close();
        };

        const emit = async () => {
          const operation = await getActiveRuntimeUpdateOperation();
          if (!operation) return finish();
          controller.enqueue(encoder.encode(`event: update\ndata: ${JSON.stringify({ operation })}\n\n`));
          if (isTerminalRuntimeUpdateStatus(operation.status)) finish();
        };

        const timer = setInterval(() => void emit(), 750);
        request.signal.addEventListener("abort", finish, { once: true });
        void emit();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
