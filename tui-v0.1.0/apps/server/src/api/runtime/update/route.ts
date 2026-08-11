import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import { assertSameOriginMutation } from "@/modules/api/same-origin";
import { getRuntimeUpdatePlan } from "@/modules/runtime/update";
import {
  getActiveRuntimeUpdateOperation,
  startRuntimeUpdateOperation,
} from "@/modules/runtime/update-operations";

const schema = z.object({
  confirm: z.literal(true),
  expectedConfigRevision: z.number().int().nullable(),
  targetTag: z.string().trim().min(1).max(120),
  trigger: z.enum(["manual", "automatic"]),
}).strict();

export async function GET() {
  try {
    const [plan, activeOperation] = await Promise.all([
      getRuntimeUpdatePlan(),
      getActiveRuntimeUpdateOperation(),
    ]);
    return Response.json({ plan, activeOperation }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const input = schema.parse(await request.json());
    const operation = await startRuntimeUpdateOperation(input);
    return Response.json({ operation }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
