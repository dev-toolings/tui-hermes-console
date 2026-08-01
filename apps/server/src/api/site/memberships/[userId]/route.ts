import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";
import { setSiteMembershipRole } from "@/modules/auth/site-memberships";

const roleSchema = z
  .object({
    role: z.enum(["admin", "operator", "requester", "approver", "auditor"]),
  })
  .strict();

export async function PUT(
  request: Request,
  context: AuthenticatedRouteContext<{ userId: string }>,
) {
  try {
    const { userId: rawUserId } = await context.params;
    const userId = z.string().trim().min(1).max(200).parse(rawUserId);
    const { role } = roleSchema.parse(await request.json());
    return Response.json({
      membership: await setSiteMembershipRole(context.siteContext, userId, role),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
