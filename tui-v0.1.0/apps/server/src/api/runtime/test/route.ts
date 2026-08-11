import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import { assertSameOriginMutation } from "@/modules/api/same-origin";
import { probeAndPersistRuntime } from "@/modules/runtime/config";

const testRuntimeSchema = z
  .object({
    baseUrl: z.string().trim().url().max(500).optional(),
    token: z.string().trim().min(1).max(2_000).optional(),
    transport: z.literal("direct").optional(),
  })
  .optional();

export async function POST(request: Request) {
  try {
    // Cette route déchiffre des secrets et ouvre une connexion sortante :
    // elle ne doit jamais être déclenchable depuis une page tierce.
    assertSameOriginMutation(request);
    const raw = await request.text();
    const input = raw ? testRuntimeSchema.parse(JSON.parse(raw)) : undefined;
    const result = await probeAndPersistRuntime(input);
    return Response.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
