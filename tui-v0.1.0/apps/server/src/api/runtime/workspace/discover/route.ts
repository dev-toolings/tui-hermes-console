import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import { assertSameOriginMutation } from "@/modules/api/same-origin";
import { discoverRuntimeWorkspace } from "@/modules/runtime/workspace";

const schema = z.object({
  expectedRevision: z.number().int().positive().optional(),
}).optional();

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const raw = await request.text();
    const input = raw ? schema.parse(JSON.parse(raw)) : undefined;
    const discovery = await discoverRuntimeWorkspace(input?.expectedRevision);
    return Response.json(
      { discovery },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
