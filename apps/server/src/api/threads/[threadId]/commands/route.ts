import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import { executeSessionCommand } from "@/modules/session/execute-command";

const bodySchema = z.object({
  message: z.string().trim().min(1).max(20_000),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ threadId: string }> },
) {
  try {
    const { threadId } = await context.params;
    const { message } = bodySchema.parse(await request.json());
    const result = await executeSessionCommand({ threadId, raw: message });
    if (!result.handled) {
      return Response.json({ handled: false });
    }
    return Response.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
