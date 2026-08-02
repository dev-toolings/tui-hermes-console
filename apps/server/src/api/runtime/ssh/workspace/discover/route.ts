import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import { assertSameOriginMutation } from "@/modules/api/same-origin";
import { discoverSshWorkspace } from "@/modules/runtime/ssh/workspace";

const schema = z.object({
  expectedRevision: z.number().int().positive().optional(),
}).optional();

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const raw = await request.text();
    const input = raw ? schema.parse(JSON.parse(raw)) : undefined;
    const discovery = await discoverSshWorkspace(input?.expectedRevision);
    return Response.json({ discovery }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
