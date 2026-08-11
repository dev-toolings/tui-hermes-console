import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { threads } from "@/db/schema";
import {
  createAgent,
  getAgent,
  resolveActiveAgentRef,
  updateAgent,
  type AgentDto,
} from "@/modules/agents/repository";
import { getRequiredConnectors } from "@console/core/modules/connectors/requirements";
import { getConnector, listConnectors } from "@/modules/connectors/repository";
import {
  parseSessionCommand,
  sessionCommandHelp,
  type SessionCommandResult,
} from "@console/core/modules/session/commands";
import { ProductRepositoryError } from "@/modules/runs/repository";
import type { ConnectorType } from "@/db/schema";
import { CONNECTOR_TYPE_LABELS } from "@console/core/modules/connectors/requirements";
import type { SiteRequestContext } from "@/modules/auth/service";
import { auditScopedMiss } from "@/modules/auth/site-access";
import {
  assertSiteAction,
  type SiteAction,
} from "@/modules/auth/site-authorization";

export function siteActionForSessionCommand(raw: string): SiteAction {
  const text = raw.trim();
  if (text === "/help" || text === "/commands") return "thread.command";
  const command = parseSessionCommand(text);
  switch (command?.kind) {
    case "agent_show":
      return "thread.read";
    case "agent_create":
      return "agent.create";
    case "agent_edit":
    case "model":
      return "agent.update";
    case "agent_switch":
      return "thread.agent.switch";
    case "connector_status":
      return "connector.read";
    default:
      return "thread.command";
  }
}

export async function executeSessionCommand(input: {
  context: SiteRequestContext;
  threadId: string;
  raw: string;
}): Promise<SessionCommandResult> {
  const text = input.raw.trim();
  const db = getDatabase();
  const [thread] = await db.select().from(threads).where(and(
    eq(threads.siteId, input.context.siteId),
    eq(threads.id, input.threadId),
    input.context.mandateProjectId
      ? eq(threads.projectId, input.context.mandateProjectId)
      : undefined,
    input.context.role === "requester"
      ? eq(threads.ownerUserId, input.context.userId)
      : undefined,
  )).limit(1);
  if (!thread) {
    await auditScopedMiss(input.context, { action: "thread.command", resourceType: "thread", resourceId: input.threadId });
    throw new ProductRepositoryError("THREAD_NOT_FOUND", "Session introuvable.");
  }

  // Même `/help` doit d'abord prouver l'accès au thread : aucune commande ne
  // devient un oracle d'existence ou un chemin de lookup hors ownership.
  await assertSiteAction(input.context, siteActionForSessionCommand(text));
  if (text === "/help" || text === "/commands") {
    return { handled: true, systemMessage: sessionCommandHelp() };
  }

  const command = parseSessionCommand(text);
  if (!command) return { handled: false };

  const isAgentCommand =
    command.kind === "agent_show" ||
    command.kind === "agent_create" ||
    command.kind === "agent_edit" ||
    command.kind === "agent_switch";

  if (isAgentCommand && command.kind !== "agent_create" && thread.source === "chat") {
    return {
      handled: true,
      systemMessage:
        "Les agents s’attachent uniquement aux sessions de mission. Démarrez-en une depuis **Sessions → Nouvelle mission**.",
    };
  }

  switch (command.kind) {
    case "agent_show": {
      return {
        handled: true,
        systemMessage: formatAgentSnapshot({
          agentId: thread.agentId,
          agentName: thread.agentName,
          instructions: thread.instructions,
          model: thread.model,
          provider: thread.provider,
        }),
      };
    }

    case "agent_create": {
      const agent = await createAgent(input.context, {
        name: command.name,
        instructions: command.instructions,
      });
      if (thread.source === "chat") {
        return {
          handled: true,
          systemMessage: `Agent créé dans le catalogue : **${agent.name}** (\`${agent.slug}\`).\n\nAppelez-le depuis ce chat avec \`@${agent.slug} votre instruction\` : une mission dédiée sera créée.`,
        };
      }
      await applyAgentToThread(input.context, input.threadId, agent);
      return {
        handled: true,
        refreshThread: true,
        systemMessage: `Agent créé et attaché à la session : **${agent.name}** (\`${agent.slug}\`).\n\n${formatAgentSnapshotFromDto(agent)}`,
      };
    }

    case "agent_edit": {
      if (!thread.agentId) {
        return {
          handled: true,
          systemMessage: "Aucun agent lié à cette session. Utilisez `/agent switch <slug>` ou `/agent create`.",
        };
      }
      const patch =
        command.field === "name"
          ? { name: command.value }
          : command.field === "instructions"
            ? { instructions: command.value }
            : command.field === "model"
              ? { model: command.value }
              : { description: command.value };
      const agent = await updateAgent(input.context, thread.agentId, patch);
      await syncThreadFromAgent(input.context, input.threadId, agent);
      return {
        handled: true,
        refreshThread: true,
        systemMessage: `Agent mis à jour : **${agent.name}**.\n\n${formatAgentSnapshotFromDto(agent)}`,
      };
    }

    case "agent_switch": {
      const agent = await resolveActiveAgentRef(input.context, command.target);
      await applyAgentToThread(input.context, input.threadId, agent);
      return {
        handled: true,
        refreshThread: true,
        systemMessage: `Session attachée à **${agent.name}** (\`${agent.slug}\`).\n\n${formatAgentSnapshotFromDto(agent)}`,
      };
    }

    case "model": {
      const now = new Date();
      await db
        .update(threads)
        .set({ model: command.model, updatedAt: now })
        .where(and(
          eq(threads.siteId, input.context.siteId),
          eq(threads.id, input.threadId),
          input.context.mandateProjectId
            ? eq(threads.projectId, input.context.mandateProjectId)
            : undefined,
        ));
      if (thread.agentId) {
        await updateAgent(input.context, thread.agentId, { model: command.model });
      }
      return {
        handled: true,
        refreshThread: true,
        systemMessage: `Modèle de session : \`${command.model}\`.`,
      };
    }

    case "connector_status": {
      const required = getRequiredConnectors({
        slug: thread.agentName.toLowerCase().replace(/\s+/g, "-"),
        name: thread.agentName,
        instructions: thread.instructions,
      });
      const all = await listConnectors(input.context);
      const lines = required.length
        ? required.map((type) => {
            const row = all.find((item) => item.type === type);
            const status = row?.passwordConfigured
              ? row.lastTestStatus === "healthy"
                ? "✓ configuré (test OK)"
                : row.lastTestStatus === "failed"
                  ? "⚠ configuré (dernier test échoué)"
                  : "○ configuré (non testé)"
              : "✗ manquant";
            return `• ${CONNECTOR_TYPE_LABELS[type]} : ${status}`;
          })
        : ["Aucun connecteur requis détecté pour l’agent actuel."];
      return {
        handled: true,
        systemMessage: `**Connecteurs**\n${lines.join("\n")}\n\nConfigurer : /settings/connectors`,
        navigateTo: required.some((type) => !all.find((c) => c.type === type)?.passwordConfigured)
          ? "/settings/connectors"
          : undefined,
      };
    }

    default:
      return { handled: false };
  }
}

export async function applyAgentToThread(context: SiteRequestContext, threadId: string, agent: AgentDto) {
  const db = getDatabase();
  const now = new Date();
  await db
    .update(threads)
    .set({
      agentId: agent.id,
      agentName: agent.name,
      instructions: agent.instructions,
      provider: agent.provider,
      model: agent.model ?? "hermes-agent",
      reasoningEffort: agent.reasoningEffort,
      source: "mission",
      updatedAt: now,
    })
    .where(and(
      eq(threads.siteId, context.siteId),
      eq(threads.id, threadId),
      context.mandateProjectId
        ? eq(threads.projectId, context.mandateProjectId)
        : undefined,
    ));
}

async function syncThreadFromAgent(context: SiteRequestContext, threadId: string, agent: AgentDto) {
  await applyAgentToThread(context, threadId, agent);
}

function formatAgentSnapshot(input: {
  agentId: string | null;
  agentName: string;
  instructions: string;
  model: string;
  provider: string | null;
}) {
  return [
    `**${input.agentName}**${input.agentId ? ` (\`${input.agentId}\`)` : ""}`,
    `Modèle : \`${input.model}\`${input.provider ? ` · provider \`${input.provider}\`` : ""}`,
    "",
    input.instructions.length > 400
      ? `${input.instructions.slice(0, 400)}…`
      : input.instructions,
  ].join("\n");
}

function formatAgentSnapshotFromDto(agent: AgentDto) {
  return formatAgentSnapshot({
    agentId: agent.id,
    agentName: agent.name,
    instructions: agent.instructions,
    model: agent.model ?? "hermes-agent",
    provider: agent.provider,
  });
}

export async function getSessionConnectorGaps(context: SiteRequestContext, threadId: string): Promise<ConnectorType[]> {
  const db = getDatabase();
  const [thread] = await db.select().from(threads).where(and(
    eq(threads.siteId, context.siteId),
    eq(threads.id, threadId),
    context.mandateProjectId
      ? eq(threads.projectId, context.mandateProjectId)
      : undefined,
    context.role === "requester" ? eq(threads.ownerUserId, context.userId) : undefined,
  )).limit(1);
  if (!thread) return [];

  let slug = thread.agentName.toLowerCase().replace(/\s+/g, "-");
  if (thread.agentId) {
    try {
      const agent = await getAgent(context, thread.agentId);
      slug = agent.slug;
    } catch {
      // ignore
    }
  }

  const required = getRequiredConnectors({
    slug,
    name: thread.agentName,
    instructions: thread.instructions,
  });

  const missing: ConnectorType[] = [];
  for (const type of required) {
    const connector = await getConnector(context, type);
    if (!connector?.passwordConfigured) missing.push(type);
  }
  return missing;
}
