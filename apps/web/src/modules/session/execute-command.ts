import { and, eq, isNull, or } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { agents, threads } from "@/db/schema";
import {
  AgentRepositoryError,
  createAgent,
  getAgent,
  requireActiveAgent,
  updateAgent,
  type AgentDto,
} from "@/modules/agents/repository";
import { getRequiredConnectors } from "@/modules/connectors/requirements";
import { getConnector, listConnectors } from "@/modules/connectors/repository";
import {
  parseSessionCommand,
  sessionCommandHelp,
  type SessionCommandResult,
} from "@/modules/session/commands";
import { ProductRepositoryError } from "@/modules/runs/repository";
import type { ConnectorType } from "@/db/schema";
import { CONNECTOR_TYPE_LABELS } from "@/modules/connectors/requirements";

export async function executeSessionCommand(input: {
  threadId: string;
  raw: string;
}): Promise<SessionCommandResult> {
  const text = input.raw.trim();

  if (text === "/help" || text === "/commands") {
    return { handled: true, systemMessage: sessionCommandHelp() };
  }

  const command = parseSessionCommand(text);
  if (!command) return { handled: false };

  const db = getDatabase();
  const [thread] = await db.select().from(threads).where(eq(threads.id, input.threadId)).limit(1);
  if (!thread) {
    throw new ProductRepositoryError("THREAD_NOT_FOUND", "Session introuvable.");
  }

  const isAgentCommand =
    command.kind === "agent_show" ||
    command.kind === "agent_create" ||
    command.kind === "agent_edit" ||
    command.kind === "agent_switch";

  if (isAgentCommand && thread.source === "chat") {
    return {
      handled: true,
      systemMessage:
        "Les agents s’attachent uniquement aux missions `/runs`. Démarrez une mission depuis **Missions → Nouvelle mission**.",
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
      const agent = await createAgent({
        name: command.name,
        instructions: command.instructions,
      });
      await applyAgentToThread(input.threadId, agent);
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
      const agent = await updateAgent(thread.agentId, patch);
      await syncThreadFromAgent(input.threadId, agent);
      return {
        handled: true,
        refreshThread: true,
        systemMessage: `Agent mis à jour : **${agent.name}**.\n\n${formatAgentSnapshotFromDto(agent)}`,
      };
    }

    case "agent_switch": {
      const agent = await resolveAgentRef(command.target);
      await applyAgentToThread(input.threadId, agent);
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
        .where(eq(threads.id, input.threadId));
      if (thread.agentId) {
        await updateAgent(thread.agentId, { model: command.model });
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
      const all = await listConnectors();
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

export async function applyAgentToThread(threadId: string, agent: AgentDto) {
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
    .where(eq(threads.id, threadId));
}

async function syncThreadFromAgent(threadId: string, agent: AgentDto) {
  await applyAgentToThread(threadId, agent);
}

async function resolveAgentRef(target: string): Promise<AgentDto> {
  const db = getDatabase();
  const normalized = target.trim();
  const [byId] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, normalized), isNull(agents.archivedAt)))
    .limit(1);
  if (byId) return requireActiveAgent(byId.id);

  const [bySlug] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.slug, normalized), isNull(agents.archivedAt)))
    .limit(1);
  if (bySlug) return requireActiveAgent(bySlug.id);

  const [byName] = await db
    .select()
    .from(agents)
    .where(
      and(
        or(eq(agents.name, normalized), eq(agents.slug, normalized.toLowerCase())),
        isNull(agents.archivedAt),
      ),
    )
    .limit(1);
  if (byName) return requireActiveAgent(byName.id);

  throw new AgentRepositoryError("AGENT_NOT_FOUND", `Agent « ${target} » introuvable.`);
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

export async function getSessionConnectorGaps(threadId: string): Promise<ConnectorType[]> {
  const db = getDatabase();
  const [thread] = await db.select().from(threads).where(eq(threads.id, threadId)).limit(1);
  if (!thread) return [];

  let slug = thread.agentName.toLowerCase().replace(/\s+/g, "-");
  if (thread.agentId) {
    try {
      const agent = await getAgent(thread.agentId);
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
    const connector = await getConnector(type);
    if (!connector?.passwordConfigured) missing.push(type);
  }
  return missing;
}
