import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import { requireActiveAgent, resolveActiveAgentRef } from "@/modules/agents/repository";
import { createThreadWithRun, listThreads } from "@/modules/runs/repository";
import { startRun } from "@/modules/runs/runner";
import { resolveAvailableRuntimeModelSelection } from "@/modules/runtime/available-model-selection";
import type { ThreadSource } from "@/db/schema";
import { withCurrentAiDisclosureConsent } from "@/modules/setup/ai-disclosure";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";
import { assertRuntimeWorkspaceReady } from "@/modules/runtime/config";
import { acquireRunStartLease } from "@/modules/runs/active-runtime-guard";
import { assertNoBlockingStorageMigration } from "@/modules/runtime/ssh/storage-migration";
import { assertNoBlockingRuntimeUpdate } from "@/modules/runtime/update-operations";

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
  agentId: z.string().trim().min(1).max(200).optional(),
  agentRef: z.string().trim().min(1).max(200).optional(),
}).strict();

function parseThreadSource(value: string | null): ThreadSource | undefined {
  if (value === "chat" || value === "mission") return value;
  return undefined;
}

export async function GET(request: Request, context: AuthenticatedRouteContext) {
  try {
    const source = parseThreadSource(new URL(request.url).searchParams.get("source"));
    return Response.json({ threads: await listThreads(context.siteContext, source ? { source } : undefined) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: AuthenticatedRouteContext,
  dependencies: { withConsent: typeof withCurrentAiDisclosureConsent } = {
    withConsent: withCurrentAiDisclosureConsent,
  },
) {
  try {
    return await dependencies.withConsent(request, async () => {
      const input = createThreadSchema.parse(await request.json());
    await assertNoBlockingStorageMigration();
    await assertNoBlockingRuntimeUpdate();
      const releaseRunStart = acquireRunStartLease();
      try {
        await assertRuntimeWorkspaceReady();

        const agent = input.agentId
          ? await requireActiveAgent(context.siteContext, input.agentId)
          : input.agentRef
            ? await resolveActiveAgentRef(context.siteContext, input.agentRef)
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
              projectId: agent.projectId ?? null,
              message: input.message,
            }
          : await (async () => {
              const selection = await resolveAvailableRuntimeModelSelection({
                repairPersisted: true,
              });
              return {
                source: "chat" as const,
                agentId: null,
                agentName: "Chat libre",
                instructions: FREE_CHAT_INSTRUCTIONS,
                provider: selection.provider,
                model: selection.model || "hermes-agent",
                reasoningEffort: selection.reasoningEffort,
                projectId: null,
                message: input.message,
              };
            })();

        const created = await createThreadWithRun(context.siteContext, resolved);
        startRun(context.siteContext, created.runId);
        return Response.json(created, { status: 202 });
      } finally {
        releaseRunStart();
      }
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
