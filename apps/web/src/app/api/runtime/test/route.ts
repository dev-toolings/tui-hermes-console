import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import { probeAndPersistRuntime } from "@/modules/runtime/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const testRuntimeSchema = z
  .object({
    baseUrl: z.string().trim().url().max(500).optional(),
    token: z.string().trim().min(1).max(2_000).optional(),
  })
  .optional();

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    const input = raw ? testRuntimeSchema.parse(JSON.parse(raw)) : undefined;
    const result = await probeAndPersistRuntime(input);
    return Response.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
