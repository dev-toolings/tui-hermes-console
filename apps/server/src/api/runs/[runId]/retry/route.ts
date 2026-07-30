import { apiErrorResponse } from "@/modules/api/errors";
import { retryRun } from "@/modules/runs/retry-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  try {
    const { runId } = await context.params;
    const result = await retryRun(runId);
    return Response.json(result, { status: 202 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
