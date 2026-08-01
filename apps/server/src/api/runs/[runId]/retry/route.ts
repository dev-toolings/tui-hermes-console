import { apiErrorResponse } from "@/modules/api/errors";
import { retryRun } from "@/modules/runs/retry-run";
import { withCurrentAiDisclosureConsent } from "@/modules/setup/ai-disclosure";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";
import { z } from "zod";

export async function POST(
  request: Request,
  context: AuthenticatedRouteContext<{ runId: string }>,
  dependencies: { withConsent: typeof withCurrentAiDisclosureConsent } = {
    withConsent: withCurrentAiDisclosureConsent,
  },
) {
  try {
    return await dependencies.withConsent(request, async () => {
      const { runId: rawRunId } = await context.params;
      const runId = z.string().trim().min(1).max(200).parse(rawRunId);
      const result = await retryRun(context.siteContext, runId);
      return Response.json(result, { status: 202 });
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
