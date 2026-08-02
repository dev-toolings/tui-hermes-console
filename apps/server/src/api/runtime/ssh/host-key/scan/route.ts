import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import { assertSameOriginMutation } from "@/modules/api/same-origin";
import { scanSshHostKey } from "@/modules/runtime/ssh/host-key";

const schema = z.object({
  host: z.string().trim().min(1).max(255).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
  port: z.number().int().min(1).max(65_535).optional(),
});

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const input = schema.parse(await request.json());
    return Response.json(
      { hostKey: await scanSshHostKey(input.host, input.port) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
