import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";
import { createGuidedTaskRevision } from "@/modules/guided-task/repository";

export async function POST(
  request: Request,
  context: AuthenticatedRouteContext<{ taskId: string }>,
) {
  try {
    const { taskId: rawTaskId } = await context.params;
    const taskId = z.string().trim().min(1).max(200).parse(rawTaskId);
    const task = await createGuidedTaskRevision(context.siteContext, taskId, await request.json());
    return Response.json({ task }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
