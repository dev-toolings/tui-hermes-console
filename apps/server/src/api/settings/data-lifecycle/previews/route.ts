import { apiErrorResponse } from "@/modules/api/errors";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";
import { createDataLifecyclePreview } from "@/modules/retention/service";

export async function POST(_request: Request, context: AuthenticatedRouteContext) {
  try {
    return Response.json(
      { preview: await createDataLifecyclePreview(context.siteContext) },
      { status: 201 },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
