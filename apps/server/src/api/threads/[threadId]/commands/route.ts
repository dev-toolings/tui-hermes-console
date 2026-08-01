import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import { executeSessionCommand } from "@/modules/session/execute-command";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";

const bodySchema = z.object({
  message: z.string().trim().min(1).max(20_000),
}).strict();

export async function POST(
  request: Request,
  context: AuthenticatedRouteContext<{ threadId: string }>,
) {
  try {
    const { threadId: rawThreadId } = await context.params;
    const threadId = z.string().trim().min(1).max(200).parse(rawThreadId);
    const { message } = bodySchema.parse(await request.json());
    const result = await executeSessionCommand({ context: context.siteContext, threadId, raw: message });
    if (!result.handled) {
      return Response.json({ handled: false });
    }
    return Response.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
