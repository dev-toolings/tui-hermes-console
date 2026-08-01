import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";
import {
  OWNERSHIP_RESOURCE_TYPES,
  transferResourceOwnership,
} from "@/modules/ownership/repository";

const paramsSchema = z.object({
  resourceType: z.enum(OWNERSHIP_RESOURCE_TYPES),
  resourceId: z.string().trim().min(1).max(200),
});
const bodySchema = z.object({
  ownerUserId: z.string().trim().min(1).max(200),
}).strict();

export async function PUT(
  request: Request,
  context: AuthenticatedRouteContext<{
    resourceType: string;
    resourceId: string;
  }>,
) {
  try {
    const { resourceType, resourceId } = paramsSchema.parse(await context.params);
    const { ownerUserId } = bodySchema.parse(await request.json());
    const ownership = await transferResourceOwnership(
      context.siteContext,
      resourceType,
      resourceId,
      ownerUserId,
    );
    return Response.json({ ownership });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
