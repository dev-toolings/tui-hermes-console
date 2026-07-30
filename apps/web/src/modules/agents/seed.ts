import { and, eq, ilike, like, ne } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { agents, threads } from "@/db/schema";
import { resolveHermesRuntimeConfig } from "@/modules/runtime/config";
import {
  HermesRuntimeError,
  listHermesModelOptions,
  listHermesModels,
  testHermesRuntimeAgainst,
} from "@/modules/runtime/hermes-adapter";
import type { AgentDto } from "./repository";

/** Identifiant stable du miroir Console ↔ runtime Hermes. */
export const HERMES_SEEDED_AGENT_ID = "agent_hermes_runtime";
export const HERMES_SEEDED_AGENT_SLUG = "hermes-agent";

const DEFAULT_INSTRUCTIONS = `Tu es Hermes, un agent d’exécution. Réponds directement à la demande de l’utilisateur.

Règles :
- Pas de salutation ni de confirmation d’état. N’annonce jamais que la connexion est active ou que tu es prêt.
- Va droit au résultat. Signale clairement les limites ou les outils manquants.
- Utilise les outils disponibles quand c’est nécessaire ; sinon réponds en texte.`;

const LEGACY_INSTRUCTIONS_MARKER = "runtime connecté à cette Console";
const LEGACY_CONSOLE_BRANCHEE_PATTERN = "%console%branchée%";

/**
 * Hermes n’a pas d’API CRUD d’agents : le « agent » runtime est le modèle
 * (`hermes-agent`) + le process gateway. Ce seeder sonde le runtime et
 * matérialise **un** agent local miroir, puis archive les miroirs périmés.
 * Les agents créés à la main ne sont pas touchés.
 */
export async function seedHermesAgentFromRuntime(): Promise<{
  agent: AgentDto;
  hermes: { version: string | null; model: string; platform: string | null };
  archivedCount: number;
}> {
  const config = await resolveHermesRuntimeConfig();
  const { health, capabilities } = await testHermesRuntimeAgainst(config);
  const models = await listHermesModels(config);
  const modelOptions = await listHermesModelOptions(config).catch(() => null);
  const provider = modelOptions?.currentProvider ?? null;

  const model =
    (typeof capabilities.model === "string" && capabilities.model) ||
    models.find((item) => item.id === "hermes-agent")?.id ||
    models[0]?.id ||
    "hermes-agent";

  const version =
    typeof health === "object" &&
    health &&
    "version" in health &&
    typeof (health as { version?: unknown }).version === "string"
      ? (health as { version: string }).version
      : null;

  const platform =
    (typeof capabilities.platform === "string" && capabilities.platform) ||
    (typeof health === "object" &&
    health &&
    "platform" in health &&
    typeof (health as { platform?: unknown }).platform === "string"
      ? (health as { platform: string }).platform
      : null);

  const now = new Date();
  const db = getDatabase();
  const description = [
    "Agent unique miroir du runtime Hermes.",
    platform ? `Plateforme ${platform}.` : null,
    version ? `Version ${version}.` : null,
    `Modèle ${model}.`,
  ]
    .filter(Boolean)
    .join(" ");

  const [existing] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.id, HERMES_SEEDED_AGENT_ID))
    .limit(1);

  if (existing) {
    await db
      .update(agents)
      .set({
        name: "Hermes Agent",
        slug: HERMES_SEEDED_AGENT_SLUG,
        description,
        instructions: DEFAULT_INSTRUCTIONS,
        provider,
        model,
        archivedAt: null,
        updatedAt: now,
      })
      .where(eq(agents.id, HERMES_SEEDED_AGENT_ID));
  } else {
    const colliding = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.slug, HERMES_SEEDED_AGENT_SLUG));
    for (const row of colliding) {
      await db
        .update(agents)
        .set({
          slug: `${HERMES_SEEDED_AGENT_SLUG}-archived-${row.id.slice(-6)}`,
          archivedAt: now,
          updatedAt: now,
        })
        .where(eq(agents.id, row.id));
    }

    await db.insert(agents).values({
      id: HERMES_SEEDED_AGENT_ID,
      name: "Hermes Agent",
      slug: HERMES_SEEDED_AGENT_SLUG,
      description,
      instructions: DEFAULT_INSTRUCTIONS,
      provider,
      model,
      createdAt: now,
      updatedAt: now,
    });
  }

  // N'archiver que les anciens miroirs (slug `hermes-agent…`), jamais les
  // agents créés à la main : ils sont adressables par `@slug` et doivent
  // survivre à un reseed.
  const archived = await db
    .update(agents)
    .set({ archivedAt: now, updatedAt: now })
    .where(
      and(
        ne(agents.id, HERMES_SEEDED_AGENT_ID),
        like(agents.slug, `${HERMES_SEEDED_AGENT_SLUG}%`),
      ),
    )
    .returning({ id: agents.id });

  // Threads copient les instructions à la création : migrer les prompts legacy
  // qui poussaient le modèle à répondre « Console branchée » à chaque tour.
  await db
    .update(threads)
    .set({ instructions: DEFAULT_INSTRUCTIONS, updatedAt: now })
    .where(ilike(threads.instructions, LEGACY_CONSOLE_BRANCHEE_PATTERN));

  const [row] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, HERMES_SEEDED_AGENT_ID))
    .limit(1);

  if (!row) {
    throw new Error("SEED_AGENT_MISSING");
  }

  return {
    agent: {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      instructions: row.instructions,
      provider: row.provider,
      model: row.model,
      reasoningEffort: row.reasoningEffort,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      runs: 0,
      lastRunAt: null,
    },
    hermes: { version, model, platform },
    archivedCount: archived.length,
  };
}

export async function ensureHermesSeededAgent(): Promise<AgentDto | null> {
  const db = getDatabase();
  const [active] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, HERMES_SEEDED_AGENT_ID))
    .limit(1);

  if (active && !active.archivedAt) {
    const now = new Date();
    if (active.instructions.includes(LEGACY_INSTRUCTIONS_MARKER)) {
      await db
        .update(agents)
        .set({ instructions: DEFAULT_INSTRUCTIONS, updatedAt: now })
        .where(eq(agents.id, HERMES_SEEDED_AGENT_ID));
    }

    // Les conversations copient le prompt à leur création. Certaines versions
    // historiques utilisaient une formulation plus courte sans le marqueur
    // `runtime connecté`, alors même que l’agent source est désormais archivé.
    await db
      .update(threads)
      .set({ instructions: DEFAULT_INSTRUCTIONS, updatedAt: now })
      .where(ilike(threads.instructions, LEGACY_CONSOLE_BRANCHEE_PATTERN));

    return {
      id: active.id,
      name: active.name,
      slug: active.slug,
      description: active.description,
      instructions: active.instructions.includes(LEGACY_INSTRUCTIONS_MARKER)
        ? DEFAULT_INSTRUCTIONS
        : active.instructions,
      provider: active.provider,
      model: active.model,
      reasoningEffort: active.reasoningEffort,
      archivedAt: null,
      createdAt: active.createdAt.toISOString(),
      updatedAt: (active.instructions.includes(LEGACY_INSTRUCTIONS_MARKER)
        ? now
        : active.updatedAt
      ).toISOString(),
      runs: 0,
      lastRunAt: null,
    };
  }

  try {
    const result = await seedHermesAgentFromRuntime();
    return result.agent;
  } catch (error) {
    if (error instanceof HermesRuntimeError) return null;
    throw error;
  }
}
