import { apiErrorResponse } from "@/modules/api/errors";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";
import {
  getSiteDataLifecyclePolicy,
  lifecyclePolicySchema,
  updateSiteDataLifecyclePolicy,
} from "@/modules/retention/service";

export async function GET(_request: Request, context: AuthenticatedRouteContext) {
  try {
    return Response.json({ policy: await getSiteDataLifecyclePolicy(context.siteContext) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PUT(request: Request, context: AuthenticatedRouteContext) {
  try {
    const input = lifecyclePolicySchema.parse(await request.json());
    return Response.json({ policy: await updateSiteDataLifecyclePolicy(context.siteContext, input) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
