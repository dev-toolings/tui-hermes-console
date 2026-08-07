import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";
import { createGuidedDeliveryAttempt } from "@/modules/guided-task/delivery";
import { withCurrentAiDisclosureConsent } from "@/modules/setup/ai-disclosure";

export async function POST(
  request: Request,
  context: AuthenticatedRouteContext<{ taskId: string }>,
  dependencies: { withConsent: typeof withCurrentAiDisclosureConsent } = {
    withConsent: withCurrentAiDisclosureConsent,
  },
) {
  try {
    return await dependencies.withConsent(request, async () => {
      const { taskId: rawTaskId } = await context.params;
      const taskId = z.string().trim().min(1).max(200).parse(rawTaskId);
      const task = await createGuidedDeliveryAttempt(context.siteContext, taskId, await request.json());
      return Response.json({ task }, { status: 202 });
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
