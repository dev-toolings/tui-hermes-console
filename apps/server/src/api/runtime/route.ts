import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import { assertSameOriginMutation } from "@/modules/api/same-origin";
import { getRuntimePublic, saveRuntimeConfig } from "@/modules/runtime/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sshSchema = z.object({
  host: z.string().trim().min(1).max(255),
  port: z.number().int().min(1).max(65_535).optional(),
  user: z.string().trim().min(1).max(120),
  auth: z.enum(["agent", "password"]).optional(),
  password: z.string().min(1).max(1_000).optional(),
});

const putRuntimeSchema = z.object({
  baseUrl: z.string().trim().url().max(500),
  token: z.string().trim().min(1).max(2_000).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  transport: z.enum(["direct", "ssh"]).optional(),
  ssh: sshSchema.optional(),
  remoteWorkdir: z.string().trim().min(1).max(400).optional(),
});

export async function GET() {
  try {
    return Response.json({ runtime: await getRuntimePublic() });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    // Écrit la cible du runtime et les secrets associés : même garde que /test.
    assertSameOriginMutation(request);
    const input = putRuntimeSchema.parse(await request.json());
    const runtimeDto = await saveRuntimeConfig(input);
    return Response.json({ runtime: runtimeDto });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
