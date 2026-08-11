import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import { createAgent, listAgents } from "@/modules/agents/repository";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";

const createAgentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  instructions: z.string().trim().min(1).max(20_000),
  model: z.string().trim().max(200).optional().nullable(),
}).strict();

export async function GET(request: Request, context: AuthenticatedRouteContext) {
  try {
    const includeArchived = new URL(request.url).searchParams.get("includeArchived") === "true";
    return Response.json({ agents: await listAgents(context.siteContext, { includeArchived }) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request, context: AuthenticatedRouteContext) {
  try {
    const input = createAgentSchema.parse(await request.json());
    const agent = await createAgent(context.siteContext, input);
    return Response.json({ agent }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
