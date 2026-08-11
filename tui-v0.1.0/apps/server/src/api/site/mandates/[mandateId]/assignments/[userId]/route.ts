import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";
import { revokeSiteMandateAssignment } from "@/modules/auth/site-mandates";

export async function DELETE(
  _request: Request,
  context: AuthenticatedRouteContext<{ mandateId: string; userId: string }>,
) {
  try {
    const { mandateId: rawMandateId, userId: rawUserId } = await context.params;
    const mandateId = z.string().trim().min(1).max(200).parse(rawMandateId);
    const userId = z.string().trim().min(1).max(200).parse(rawUserId);
    return Response.json({ assignment: await revokeSiteMandateAssignment(context.siteContext, mandateId, userId) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
