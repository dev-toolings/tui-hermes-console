import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import { probeAndPersistRuntime } from "@/modules/runtime/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const testRuntimeSchema = z
  .object({
    baseUrl: z.string().trim().url().max(500).optional(),
    token: z.string().trim().min(1).max(2_000).optional(),
    transport: z.enum(["direct", "ssh"]).optional(),
    ssh: z
      .object({
        host: z.string().trim().min(1).max(255),
        port: z.number().int().min(1).max(65_535).optional(),
        user: z.string().trim().min(1).max(120),
        auth: z.enum(["agent", "password"]).optional(),
        password: z.string().min(1).max(1_000).optional(),
      })
      .optional(),
    remoteWorkdir: z.string().trim().min(1).max(400).optional(),
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
