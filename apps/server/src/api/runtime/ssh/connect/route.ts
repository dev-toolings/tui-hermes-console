import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import { assertSameOriginMutation } from "@/modules/api/same-origin";
import { connectAndSaveSshRuntime } from "@/modules/runtime/config";

const schema = z.object({
  baseUrl: z.string().trim().url().max(500),
  token: z.string().trim().min(1).max(2_000).optional(),
  credentialMode: z.enum(["manual", "import"]).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  expectedRevision: z.number().int().positive().nullable().optional(),
  ssh: z.object({
    host: z.string().trim().min(1).max(255).regex(/^[A-Za-z0-9._:-]+$/),
    port: z.number().int().min(1).max(65_535).optional(),
    user: z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9._-]+$/),
    auth: z.enum(["agent", "password"]).optional(),
    password: z.string().min(1).max(1_000).optional(),
  }),
});

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const result = await connectAndSaveSshRuntime(schema.parse(await request.json()));
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
