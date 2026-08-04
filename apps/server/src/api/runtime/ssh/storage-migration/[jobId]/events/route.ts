import {
  getStorageMigrationJob,
  storageMigrationRuntimeDto,
} from "@/modules/runtime/ssh/storage-migration";

export async function GET(
  request: Request,
  context: { params: Promise<Record<string, string>> },
) {
  const { jobId } = await context.params;
  if (!(await getStorageMigrationJob(jobId))) {
    return Response.json(
      { error: { code: "SSH_STORAGE_MIGRATION_NOT_FOUND", message: "Migration de stockage introuvable." } },
      { status: 404 },
    );
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
      const emit = async () => {
        if (closed) return;
        const job = await getStorageMigrationJob(jobId);
        if (!job) return finish();
        const runtime = await storageMigrationRuntimeDto(job.id);
        controller.enqueue(
          encoder.encode(
            `event: update\ndata: ${JSON.stringify({ job: runtime ? { ...job, runtime } : job })}\n\n`,
          ),
        );
        if (["succeeded", "rolled_back", "failed", "recovery_required"].includes(job.status)) {
          return finish();
        }
        timer = setTimeout(() => void emit(), 500);
      };
      void emit().catch(finish);
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
