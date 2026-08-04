import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import { assertSameOriginMutation } from "@/modules/api/same-origin";
import { requireSession } from "@/modules/auth/service";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";
import {
  createRuntimeSecretRevealChallenge,
  RUNTIME_SECRET_NAME,
} from "@/modules/runtime/secret-reveal";

const schema = z.object({ secretName: z.literal(RUNTIME_SECRET_NAME) });

export async function POST(
  request: Request,
  context: AuthenticatedRouteContext,
) {
  try {
    assertSameOriginMutation(request);
    const session = await requireSession(request);
    const result = await createRuntimeSecretRevealChallenge({
      actor: session,
      siteContext: context.siteContext,
    });
    return Response.json(result, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache",
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export { schema as runtimeSecretRevealChallengeSchema };
