import { apiErrorResponse } from "@/modules/api/errors";
import { assertSameOriginMutation } from "@/modules/api/same-origin";
import {
  buildSshProvisionPlan,
  inspectSshTarget,
} from "@/modules/runtime/ssh/provisioning";
import { parseProvisionInput } from "../provisioning-shared";

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const input = parseProvisionInput(await request.json());
    const inspection = await inspectSshTarget(input.target, input.remoteBaseUrl, input.remoteWorkdir);
    const plan = buildSshProvisionPlan(input, inspection);
    return Response.json({ inspection, plan }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
