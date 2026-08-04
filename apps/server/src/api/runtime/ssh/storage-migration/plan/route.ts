import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import { assertSameOriginMutation } from "@/modules/api/same-origin";
import { createStorageMigrationPlan } from "@/modules/runtime/ssh/storage-migration";

const schema = z.object({
  expectedRevision: z.number().int().positive(),
  targetHostRoot: z.string().trim().min(1).max(400).optional(),
});

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const input = schema.parse(await request.json());
    const plan = await createStorageMigrationPlan(
      input.expectedRevision,
      input.targetHostRoot,
    );
    return Response.json({ plan }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
