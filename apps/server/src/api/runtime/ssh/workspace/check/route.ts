import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import { assertSameOriginMutation } from "@/modules/api/same-origin";
import { checkSshWorkspace } from "@/modules/runtime/ssh/workspace";

const schema = z.object({
  remoteWorkdir: z.string().trim().min(1).max(400),
  remoteHermesWorkdir: z.string().trim().min(1).max(400).optional(),
});

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const candidate = await checkSshWorkspace(schema.parse(await request.json()));
    return Response.json({ candidate }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
