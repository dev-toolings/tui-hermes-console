import { ZodError } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";
import {
  AuditExportError,
  createSiteAuditExport,
} from "@/modules/audit/export";

/**
 * The bytes are returned only after createSiteAuditExport has appended the
 * successful export audit entry. An append failure deliberately has no body.
 */
export async function POST(
  request: Request,
  context: AuthenticatedRouteContext,
) {
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
    const result = await createSiteAuditExport(context.siteContext, rawInput);
    return new Response(result.body, {
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "content-disposition": `attachment; filename="audit-${result.fromSequence}-${result.toSequence}.ndjson"`,
        "cache-control": "no-store",
        "x-audit-export-sha256": result.sha256,
        "x-audit-export-event": result.exportEventId,
      },
    });
  } catch (error) {
    if (error instanceof AuditExportError) {
      if (error.code === "AUDIT_EXPORT_AUDIT_UNAVAILABLE") {
        // No JSON error: callers must never mistake a partial export for a
        // successful one when its success audit could not be appended.
        return new Response(null, {
          status: 503,
          headers: { "cache-control": "no-store" },
        });
      }
      return Response.json(
        { error: { code: error.code, message: error.message } },
        { status: error.code === "AUDIT_EXPORT_CHAIN_INVALID" ? 409 : 400 },
      );
    }
    if (error instanceof ZodError) {
      return apiErrorResponse(error);
    }
    return apiErrorResponse(error);
  }
}
