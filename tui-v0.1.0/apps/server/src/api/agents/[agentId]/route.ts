import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import { deleteAgent, getAgent, updateAgent } from "@/modules/agents/repository";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";

const agentIdSchema = z.string().trim().min(1).max(200);

const patchAgentSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  instructions: z.string().trim().min(1).max(20_000).optional(),
  model: z.string().trim().max(200).optional().nullable(),
  archive: z.boolean().optional(),
}).strict();

export async function GET(
  _request: Request,
  context: AuthenticatedRouteContext<{ agentId: string }>,
) {
  try {
    const { agentId: rawAgentId } = await context.params;
    const agentId = agentIdSchema.parse(rawAgentId);
    return Response.json({ agent: await getAgent(context.siteContext, agentId) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: AuthenticatedRouteContext<{ agentId: string }>,
) {
  try {
    const { agentId: rawAgentId } = await context.params;
    const agentId = agentIdSchema.parse(rawAgentId);
    const input = patchAgentSchema.parse(await request.json());
    const agent = await updateAgent(context.siteContext, agentId, input);
    return Response.json({ agent });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  context: AuthenticatedRouteContext<{ agentId: string }>,
  dependencies: { delete: typeof deleteAgent } = { delete: deleteAgent },
) {
  try {
    const { agentId: rawAgentId } = await context.params;
    const agentId = agentIdSchema.parse(rawAgentId);
    await dependencies.delete(context.siteContext, agentId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
