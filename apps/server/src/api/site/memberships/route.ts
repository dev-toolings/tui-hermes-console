import { apiErrorResponse } from "@/modules/api/errors";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";
import { listSiteMemberships } from "@/modules/auth/site-memberships";

export async function GET(
  _request: Request,
  context: AuthenticatedRouteContext,
) {
  try {
    return Response.json({
      memberships: await listSiteMemberships(context.siteContext),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
