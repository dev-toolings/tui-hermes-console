import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import { deleteAgent, getAgent, updateAgent } from "@/modules/agents/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchAgentSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  instructions: z.string().trim().min(1).max(20_000).optional(),
  model: z.string().trim().max(200).optional().nullable(),
  archive: z.boolean().optional(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ agentId: string }> },
) {
  try {
    const { agentId } = await context.params;
    return Response.json({ agent: await getAgent(agentId) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ agentId: string }> },
) {
  try {
    const { agentId } = await context.params;
    const input = patchAgentSchema.parse(await request.json());
    const agent = await updateAgent(agentId, input);
    return Response.json({ agent });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ agentId: string }> },
) {
  try {
    const { agentId } = await context.params;
    await deleteAgent(agentId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
