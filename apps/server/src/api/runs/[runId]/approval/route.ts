import { apiErrorResponse } from "@/modules/api/errors";
import { respondRunApproval } from "@/modules/runs/respond-approval";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";
import { z } from "zod";

export async function POST(
  request: Request,
  context: AuthenticatedRouteContext<{ runId: string }>,
  dependencies: { approve: typeof respondRunApproval } = { approve: respondRunApproval },
) {
  try {
    const { runId: rawRunId } = await context.params;
    const runId = z.string().trim().min(1).max(200).parse(rawRunId);
    const body = await request.json();
    const result = await dependencies.approve(context.siteContext, runId, body);
    return Response.json(result, { status: 200 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
