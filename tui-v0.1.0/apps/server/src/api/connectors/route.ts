import { apiErrorResponse } from "@/modules/api/errors";
import { listConnectors } from "@/modules/connectors/repository";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";

export async function GET(_request: Request, context: AuthenticatedRouteContext) {
  try {
    return Response.json({ connectors: await listConnectors(context.siteContext) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
