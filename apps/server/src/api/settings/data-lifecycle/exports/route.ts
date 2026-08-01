import { apiErrorResponse } from "@/modules/api/errors";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";
import { createLifecycleExport, lifecycleExportSchema } from "@/modules/retention/export";

export async function POST(request: Request, context: AuthenticatedRouteContext) {
  try {
    const input = lifecycleExportSchema.parse(await request.json());
    const result = await createLifecycleExport(context.siteContext, input);
    return new Response(result.body, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="hermes-console-export-${result.previewId}.json"`,
        "cache-control": "no-store",
        "x-lifecycle-export-sha256": result.sha256,
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
