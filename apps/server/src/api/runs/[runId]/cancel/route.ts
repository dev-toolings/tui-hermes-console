import { apiErrorResponse } from "@/modules/api/errors";
import { cancelRun } from "@/modules/runs/cancel-run";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";
import { z } from "zod";

export async function POST(
  _request: Request,
  context: AuthenticatedRouteContext<{ runId: string }>,
  dependencies: { cancel: typeof cancelRun } = { cancel: cancelRun },
) {
  try {
    const { runId: rawRunId } = await context.params;
    const runId = z.string().trim().min(1).max(200).parse(rawRunId);
    const result = await dependencies.cancel(context.siteContext, runId);
    return Response.json(result, { status: 202 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
