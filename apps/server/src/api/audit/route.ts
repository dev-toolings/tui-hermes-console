import { apiErrorResponse } from "@/modules/api/errors";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";
import { listSiteAuditEntries } from "@/modules/audit/read";

export async function GET(request: Request, context: AuthenticatedRouteContext) {
  try {
    const rawLimit = Number(new URL(request.url).searchParams.get("limit"));
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(Math.trunc(rawLimit), 1), 200)
      : 50;
    return Response.json({
      entries: await listSiteAuditEntries(context.siteContext, limit),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
