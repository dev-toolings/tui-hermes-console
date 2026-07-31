import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import { requireActiveAgent, resolveActiveAgentRef } from "@/modules/agents/repository";
import { createThreadWithRun, listThreads } from "@/modules/runs/repository";
import { startRun } from "@/modules/runs/runner";
import { getRuntimeModelSelection } from "@/modules/runtime/model-settings";
import type { ThreadSource } from "@/db/schema";

const FREE_CHAT_INSTRUCTIONS = `Tu es un assistant conversationnel. Réponds directement à la demande.

Règles :
- Pas de salutation ni de confirmation d’état.
- Va droit au résultat. Signale clairement les limites ou les outils manquants.
- Utilise les outils disponibles quand c’est nécessaire ; sinon réponds en texte.`;

/**
 * Un seul objet, pas une union : `z.object` supprime les clés inconnues, donc
 * une union ferait matcher `{agentId, message}` sur la branche « message seul »
 * et l'agent serait perdu en silence.
 *
 * `agentId` — sélection explicite (formulaire mission). `agentRef` — référence
 * saisie à la main via une mention `@slug`. Les deux produisent une mission ;
 * sans agent, c'est du chat libre.
 */
const createThreadSchema = z.object({
  message: z.string().trim().min(1).max(100_000),
  agentId: z.string().trim().min(1).optional(),
  agentRef: z.string().trim().min(1).optional(),
});

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

    const agent = input.agentId
      ? await requireActiveAgent(input.agentId)
      : input.agentRef
        ? await resolveActiveAgentRef(input.agentRef)
        : null;

    const resolved = agent
      ? {
          source: "mission" as const,
          agentId: agent.id,
          agentName: agent.name,
          instructions: agent.instructions,
          provider: agent.provider,
          model: agent.model || "hermes-agent",
          reasoningEffort: agent.reasoningEffort,
          message: input.message,
        }
      : await (async () => {
          const selection = await getRuntimeModelSelection();
          return {
            source: "chat" as const,
            agentId: null,
            agentName: "Chat libre",
            instructions: FREE_CHAT_INSTRUCTIONS,
            provider: selection.provider,
            model: selection.model || "hermes-agent",
            reasoningEffort: selection.reasoningEffort,
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
