import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import { getRuntimePublic, saveRuntimeConfig } from "@/modules/runtime/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const putRuntimeSchema = z.object({
  baseUrl: z.string().trim().url().max(500),
  token: z.string().trim().min(1).max(2_000).optional(),
  name: z.string().trim().min(1).max(120).optional(),
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
    const input = putRuntimeSchema.parse(await request.json());
    const runtimeDto = await saveRuntimeConfig(input);
    return Response.json({ runtime: runtimeDto });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
