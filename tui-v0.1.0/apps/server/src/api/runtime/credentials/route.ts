import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import { assertSameOriginMutation } from "@/modules/api/same-origin";
import {
  applyRuntimeCredentialOperation,
  getRuntimeCredentialOperation,
} from "@/modules/runtime/credentials";

const schema = z.object({
  planId: z.string().uuid(),
  confirmation: z.string().trim().min(1).max(500),
  expectedRevision: z.number().int().positive(),
});

export async function GET() {
  return Response.json(
    { operation: null },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const result = await applyRuntimeCredentialOperation(schema.parse(await request.json()));
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export { getRuntimeCredentialOperation };
