import { apiErrorResponse } from "@/modules/api/errors";
import { respondRunApproval } from "@/modules/runs/respond-approval";

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  try {
    const { runId } = await context.params;
    const body = await request.json();
    const result = await respondRunApproval(runId, body);
    return Response.json(result, { status: 200 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
