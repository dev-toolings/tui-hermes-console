import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";
import { getGuidedTask } from "@/modules/guided-task/repository";

export async function GET(
  _request: Request,
  context: AuthenticatedRouteContext<{ taskId: string }>,
) {
  try {
    const { taskId: rawTaskId } = await context.params;
    const taskId = z.string().trim().min(1).max(200).parse(rawTaskId);
    return Response.json({ task: await getGuidedTask(context.siteContext, taskId) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
