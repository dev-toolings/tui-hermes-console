import { apiErrorResponse } from "@/modules/api/errors";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";
import { createGuidedTask, listGuidedTasks } from "@/modules/guided-task/repository";

export async function GET(_request: Request, context: AuthenticatedRouteContext) {
  try {
    return Response.json({ tasks: await listGuidedTasks(context.siteContext) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request, context: AuthenticatedRouteContext) {
  try {
    const task = await createGuidedTask(context.siteContext, await request.json());
    return Response.json({ task }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
