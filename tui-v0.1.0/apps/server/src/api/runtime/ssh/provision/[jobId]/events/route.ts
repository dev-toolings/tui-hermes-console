import { getSshProvisionJob } from "../../route";

export async function GET(
  request: Request,
  context: { params: Promise<Record<string, string>> },
) {
  const { jobId } = await context.params;
  if (!getSshProvisionJob(jobId)) {
    return Response.json({ error: { code: "SSH_JOB_NOT_FOUND", message: "Job SSH introuvable." } }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = () => {
        if (closed) return;
        closed = true;
        if (timer) clearTimeout(timer);
        controller.close();
      };
      const emit = () => {
        if (closed) return;
        const job = getSshProvisionJob(jobId);
        if (!job) {
          finish();
          return;
        }
        controller.enqueue(encoder.encode(`event: update\ndata: ${JSON.stringify({ job })}\n\n`));
        if (job.status === "succeeded" || job.status === "failed") {
          finish();
          return;
        }
        timer = setTimeout(emit, 500);
      };
      emit();
      request.signal.addEventListener("abort", finish, { once: true });
    },
  });
  return new Response(stream, {
    headers: {
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
    },
  });
}
