import { apiErrorResponse } from "@/modules/api/errors";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";
import { z } from "zod";
import { createGuidedTask, listGuidedTaskSummaries } from "@/modules/guided-task/repository";

const cursorSchema = z.object({
  updatedAt: z.string().datetime({ offset: true }),
  id: z.string().trim().min(1).max(200),
}).strict();

function validCursor(cursor: string) {
  try {
    const decoded = cursorSchema.safeParse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    if (!decoded.success || !Number.isFinite(new Date(decoded.data.updatedAt).getTime())) return false;
    return Buffer.from(JSON.stringify(decoded.data)).toString("base64url") === cursor;
  } catch {
    return false;
  }
}

const inboxQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).transform((limit) => Math.min(limit, 100)).default(50),
  cursor: z.string().trim().min(1).refine(validCursor, "Cursor Inbox invalide.").optional(),
});

const inboxResponseSchema = z.object({
  tasks: z.array(z.object({
    id: z.string(),
    title: z.string(),
    status: z.enum(["draft", "ready", "running", "awaiting_validation", "completed", "failed"]),
    projectName: z.string(),
    currentRevision: z.object({
      id: z.string(),
      state: z.enum(["draft", "validated"]),
      requiresTechnicalApproval: z.boolean(),
    }).nullable(),
    latestAttempt: z.object({
      id: z.string(),
      revisionId: z.string(),
      status: z.enum(["pending", "running", "awaiting_functional_validation", "completed", "failed"]),
    }).nullable(),
    decisions: z.array(z.object({
      kind: z.enum(["plan", "technical", "tool", "functional"]),
      outcome: z.enum(["approved", "rejected"]),
      attemptId: z.string().nullable(),
    })),
    updatedAt: z.string().datetime({ offset: true }),
  })),
  page: z.object({ hasMore: z.boolean(), nextCursor: z.string().nullable() }),
});

export async function GET(request: Request, context: AuthenticatedRouteContext) {
  try {
    const query = inboxQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const result = await listGuidedTaskSummaries(context.siteContext, query);
    return Response.json(inboxResponseSchema.parse({
      tasks: result.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        projectName: task.projectName,
        currentRevision: task.currentRevision,
        latestAttempt: task.latestAttempt && {
          id: task.latestAttempt.id,
          revisionId: task.latestAttempt.revisionId,
          status: task.latestAttempt.status,
        },
        decisions: task.decisions.map((decision) => ({
          kind: decision.kind,
          outcome: decision.outcome,
          attemptId: decision.attemptId,
        })),
        updatedAt: task.updatedAt,
      })),
      page: result.page,
    }));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request, context: AuthenticatedRouteContext) {
  try {
    const task = await createGuidedTask(context.siteContext, await request.json());
    return Response.json({ task }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
