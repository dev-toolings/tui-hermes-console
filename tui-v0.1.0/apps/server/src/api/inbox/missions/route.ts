import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";
import { listInboxMissionSummaries } from "@/modules/runs/repository";

const cursorSchema = z.object({ updatedAt: z.string().datetime({ offset: true }), id: z.string().min(1).max(200) }).strict();
function validCursor(cursor: string) {
  try {
    const decoded = cursorSchema.safeParse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    return decoded.success && Buffer.from(JSON.stringify(decoded.data)).toString("base64url") === cursor;
  } catch { return false; }
}
const querySchema = z.object({
  limit: z.coerce.number().int().min(1).transform((limit) => Math.min(limit, 100)).default(50),
  cursor: z.string().min(1).refine(validCursor, "Cursor Inbox missions invalide.").optional(),
});
const responseSchema = z.object({
  missions: z.array(z.object({
    id: z.string(), title: z.string(), agentName: z.string(), updatedAt: z.string().datetime({ offset: true }),
    latestRun: z.object({ status: z.enum(["pending", "starting", "running", "awaiting_approval", "completed", "failed", "cancelled"]) }).nullable(),
  })),
  page: z.object({ hasMore: z.boolean(), nextCursor: z.string().nullable() }),
});

export async function GET(request: Request, context: AuthenticatedRouteContext) {
  try {
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const page = await listInboxMissionSummaries(context.siteContext, query);
    return Response.json(responseSchema.parse({
      missions: page.missions.map((mission) => ({
        id: mission.id, title: mission.title, agentName: mission.agentName, updatedAt: mission.updatedAt,
        latestRun: mission.latestRun && { status: mission.latestRun.status },
      })),
      page: page.page,
    }));
  } catch (error) { return apiErrorResponse(error); }
}
