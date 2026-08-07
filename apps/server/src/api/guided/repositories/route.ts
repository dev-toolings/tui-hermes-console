import { apiErrorResponse } from "@/modules/api/errors";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";
import {
  createGuidedProjectRepository,
  listGuidedProjectRepositories,
} from "@/modules/guided-task/project-repository";

export async function GET(_request: Request, context: AuthenticatedRouteContext) {
  try {
    return Response.json({ repositories: await listGuidedProjectRepositories(context.siteContext) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request, context: AuthenticatedRouteContext) {
  try {
    return Response.json(
      { repository: await createGuidedProjectRepository(context.siteContext, await request.json()) },
      { status: 201 },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
