import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import { assertSameOriginMutation } from "@/modules/api/same-origin";
import { activateSshWorkspace } from "@/modules/runtime/ssh/workspace";

const schema = z.object({
  remoteWorkdir: z.string().trim().min(1).max(400),
  remoteHermesWorkdir: z.string().trim().min(1).max(400),
  create: z.boolean().optional(),
  alignHermesCwd: z.boolean().optional(),
  expectedRevision: z.number().int().positive(),
});

export async function PUT(request: Request) {
  try {
    assertSameOriginMutation(request);
    const result = await activateSshWorkspace(schema.parse(await request.json()));
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
