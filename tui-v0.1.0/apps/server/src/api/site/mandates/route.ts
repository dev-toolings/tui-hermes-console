import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";
import { createSiteMandate, listSiteMandates } from "@/modules/auth/site-mandates";

const mandateSchema = z.object({
  operatorOrganizationId: z.string().trim().min(1).max(200),
  projectId: z.string().trim().min(1).max(200).nullable().optional(),
  startsAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
}).strict();

export async function GET(
  _request: Request,
  context: AuthenticatedRouteContext,
) {
  try {
    return Response.json({ mandates: await listSiteMandates(context.siteContext) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: AuthenticatedRouteContext,
) {
  try {
    const input = mandateSchema.parse(await request.json());
    return Response.json(
      { mandate: await createSiteMandate(context.siteContext, input) },
      { status: 201 },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
