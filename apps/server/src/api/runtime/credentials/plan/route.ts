import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import { assertSameOriginMutation } from "@/modules/api/same-origin";
import { planRuntimeCredentialOperation } from "@/modules/runtime/credentials";

const schema = z.object({
  operation: z.enum(["import", "generate", "rotate"]),
  expectedRevision: z.number().int().positive().nullable().optional(),
});

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const plan = await planRuntimeCredentialOperation(schema.parse(await request.json()));
    return Response.json({ plan }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
