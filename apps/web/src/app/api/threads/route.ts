import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import { requireActiveAgent } from "@/modules/agents/repository";
import { ensureHermesSeededAgent } from "@/modules/agents/seed";
import { createThreadWithRun, listThreads } from "@/modules/runs/repository";
import { startRun } from "@/modules/runs/runner";
import type { ThreadSource } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FREE_CHAT_INSTRUCTIONS = `Tu es un assistant conversationnel. Réponds directement à la demande.

Règles :
- Pas de salutation ni de confirmation d’état.
- Va droit au résultat. Signale clairement les limites ou les outils manquants.
- Utilise les outils disponibles quand c’est nécessaire ; sinon réponds en texte.`;

const createThreadSchema = z.union([
  z.object({
    message: z.string().trim().min(1).max(100_000),
  }),
  z.object({
    agentId: z.string().trim().min(1),
    message: z.string().trim().min(1).max(100_000),
  }),
]);

function parseThreadSource(value: string | null): ThreadSource | undefined {
  if (value === "chat" || value === "mission") return value;
  return undefined;
}

export async function GET(request: Request) {
  try {
    const source = parseThreadSource(new URL(request.url).searchParams.get("source"));
    return Response.json({ threads: await listThreads(source ? { source } : undefined) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = createThreadSchema.parse(await request.json());
    const resolved =
      "agentId" in input
        ? await (async () => {
            const agent = await requireActiveAgent(input.agentId);
            return {
              source: "mission" as const,
              agentId: agent.id,
              agentName: agent.name,
              instructions: agent.instructions,
              provider: agent.provider,
              model: agent.model || "hermes-agent",
              reasoningEffort: agent.reasoningEffort,
              message: input.message,
            };
          })()
        : await (async () => {
            const seeded = await ensureHermesSeededAgent();
            return {
              source: "chat" as const,
              agentId: null,
              agentName: "Chat libre",
              instructions: FREE_CHAT_INSTRUCTIONS,
              provider: seeded?.provider ?? null,
              model: seeded?.model || "hermes-agent",
              reasoningEffort: seeded?.reasoningEffort ?? null,
              message: input.message,
            };
          })();

    const created = await createThreadWithRun(resolved);
    startRun(created.runId);
    return Response.json(created, { status: 202 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
