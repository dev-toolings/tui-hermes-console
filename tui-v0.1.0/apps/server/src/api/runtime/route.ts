import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import { assertSameOriginMutation } from "@/modules/api/same-origin";
import {
  deleteRuntimeConfig,
  getRuntimePublic,
  saveRuntimeConfig,
} from "@/modules/runtime/config";

const putRuntimeSchema = z.object({
  baseUrl: z.string().trim().url().max(500),
  token: z.string().trim().min(1).max(2_000).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  transport: z.literal("direct").optional(),
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

export async function DELETE(request: Request) {
  try {
    assertSameOriginMutation(request);
    return Response.json({ runtime: await deleteRuntimeConfig() });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
