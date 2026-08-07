import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";
import { saveGuidedProjectRepository } from "@/modules/guided-task/project-repository";

export async function PUT(
  request: Request,
  context: AuthenticatedRouteContext<{ projectId: string }>,
) {
  try {
    const { projectId: rawProjectId } = await context.params;
    const projectId = z.string().trim().min(1).max(200).parse(rawProjectId);
    const repository = await saveGuidedProjectRepository(
      context.siteContext,
      projectId,
      await request.json(),
    );
    return Response.json({ repository });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
