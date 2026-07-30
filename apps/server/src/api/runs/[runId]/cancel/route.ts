import { apiErrorResponse } from "@/modules/api/errors";
import { cancelRun } from "@/modules/runs/cancel-run";

export async function POST(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  try {
    const { runId } = await context.params;
    const result = await cancelRun(runId);
    return Response.json(result, { status: 202 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
