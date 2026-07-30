import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import { createAgent, listAgents } from "@/modules/agents/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createAgentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  instructions: z.string().trim().min(1).max(20_000),
  model: z.string().trim().max(200).optional().nullable(),
});

export async function GET() {
  try {
    return Response.json({ agents: await listAgents() });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = createAgentSchema.parse(await request.json());
    const agent = await createAgent(input);
    return Response.json({ agent }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
