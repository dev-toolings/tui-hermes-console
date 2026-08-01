import { apiErrorResponse } from "@/modules/api/errors";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";
import {
  createLifecycleExport,
  LifecycleExportError,
  lifecycleExportSchema,
} from "@/modules/retention/export";

export const LIFECYCLE_EXPORT_FILENAME = "hermes-console-data-lifecycle-export.json";

export function lifecycleExportErrorResponse(error: unknown): Response {
  if (
    error instanceof LifecycleExportError &&
    error.code === "LIFECYCLE_EXPORT_AUDIT_UNAVAILABLE"
  ) {
    // An export is never emitted when its success audit cannot be committed.
    return new Response(null, {
      status: 503,
      headers: { "cache-control": "no-store" },
    });
  }
  return apiErrorResponse(error);
}

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
    const input = lifecycleExportSchema.parse(rawInput);
    const result = await createLifecycleExport(context.siteContext, input);
    return new Response(result.body, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${LIFECYCLE_EXPORT_FILENAME}"`,
        "cache-control": "no-store",
        "x-lifecycle-export-sha256": result.sha256,
      },
    });
  } catch (error) {
    return lifecycleExportErrorResponse(error);
  }
}
