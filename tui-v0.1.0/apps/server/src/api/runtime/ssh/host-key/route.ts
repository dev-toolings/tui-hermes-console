import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import { assertSameOriginMutation } from "@/modules/api/same-origin";
import { acceptSshHostKey } from "@/modules/runtime/ssh/host-key";

const schema = z.object({
  host: z.string().trim().min(1).max(255).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
  port: z.number().int().min(1).max(65_535).default(22),
  lookup: z.string().trim().min(1).max(300),
  keyType: z.string().trim().min(1).max(100),
  keyBase64: z.string().trim().min(1).max(4_000).regex(/^[A-Za-z0-9+/=]+$/),
  fingerprintSha256: z.string().trim().regex(/^SHA256:[A-Za-z0-9+/]+$/),
});

export async function PUT(request: Request) {
  try {
    assertSameOriginMutation(request);
    const hostKey = await acceptSshHostKey(schema.parse(await request.json()));
    return Response.json(
      { accepted: true, hostKey },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
