import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";
import { assignSiteMandate } from "@/modules/auth/site-mandates";

const assignmentSchema = z.object({ userId: z.string().trim().min(1).max(200) }).strict();

export async function POST(
  request: Request,
  context: AuthenticatedRouteContext<{ mandateId: string }>,
) {
  try {
    const { mandateId: rawMandateId } = await context.params;
    const mandateId = z.string().trim().min(1).max(200).parse(rawMandateId);
    const { userId } = assignmentSchema.parse(await request.json());
    return Response.json({ assignment: await assignSiteMandate(context.siteContext, mandateId, userId) }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
