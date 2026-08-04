import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import { assertSameOriginMutation } from "@/modules/api/same-origin";
import { requireSession } from "@/modules/auth/service";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";
import {
  verifyRuntimeSecretReveal,
  RUNTIME_SECRET_NAME,
} from "@/modules/runtime/secret-reveal";

const schema = z.object({
  secretName: z.literal(RUNTIME_SECRET_NAME),
  challengeId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/),
});

export async function POST(
  request: Request,
  context: AuthenticatedRouteContext,
) {
  try {
    assertSameOriginMutation(request);
    const session = await requireSession(request);
    const input = schema.parse(await request.json());
    const result = await verifyRuntimeSecretReveal({
      actor: session,
      siteContext: context.siteContext,
      challengeId: input.challengeId,
      code: input.code,
    });
    return Response.json(result, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
