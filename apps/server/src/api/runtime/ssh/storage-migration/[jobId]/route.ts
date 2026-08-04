import {
  getStorageMigrationJob,
  storageMigrationRuntimeDto,
} from "@/modules/runtime/ssh/storage-migration";

export async function GET(
  _request: Request,
  context: { params: Promise<Record<string, string>> },
) {
  const { jobId } = await context.params;
  const job = await getStorageMigrationJob(jobId);
  if (!job) {
    return Response.json(
      { error: { code: "SSH_STORAGE_MIGRATION_NOT_FOUND", message: "Migration de stockage introuvable." } },
      { status: 404 },
    );
  }
  const runtime = await storageMigrationRuntimeDto(job.id);
  return Response.json(
    { job: runtime ? { ...job, runtime } : job },
    { headers: { "Cache-Control": "no-store" } },
  );
}
