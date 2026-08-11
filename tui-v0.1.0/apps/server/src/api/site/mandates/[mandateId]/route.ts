import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";
import { revokeSiteMandate } from "@/modules/auth/site-mandates";

export async function DELETE(
  _request: Request,
  context: AuthenticatedRouteContext<{ mandateId: string }>,
) {
  try {
    const { mandateId: rawMandateId } = await context.params;
    const mandateId = z.string().trim().min(1).max(200).parse(rawMandateId);
    return Response.json({ mandate: await revokeSiteMandate(context.siteContext, mandateId) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
