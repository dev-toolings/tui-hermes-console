import { apiErrorResponse } from "@/modules/api/errors";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";
import { lifecyclePurgeSchema, purgeDataLifecycle } from "@/modules/retention/purge";

export async function POST(request: Request, context: AuthenticatedRouteContext) {
  try {
    let rawInput: unknown;
    try {
      rawInput = await request.json();
    } catch {
      return Response.json(
        { error: { code: "INVALID_INPUT", message: "La requête contient des données invalides." } },
        { status: 400 },
      );
    }
    const input = lifecyclePurgeSchema.parse(rawInput);
    return Response.json(
      { purge: await purgeDataLifecycle(context.siteContext, input) },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
