import { apiErrorResponse } from "@/modules/api/errors";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";
import { getDataLifecyclePreview } from "@/modules/retention/service";

export async function GET(
  _request: Request,
  context: AuthenticatedRouteContext<{ previewId: string }>,
) {
  try {
    const { previewId } = await context.params;
    return Response.json({ preview: await getDataLifecyclePreview(context.siteContext, previewId) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
