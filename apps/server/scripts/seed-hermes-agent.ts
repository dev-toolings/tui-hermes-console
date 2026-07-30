/**
 * Seed l’unique agent Console depuis le runtime Hermes joignable.
 *
 * Usage: bun run db:seed
 *
 * Hermes n’expose pas de CRUD d’agents — on sonde /health + /v1/models +
 * /v1/capabilities et on matérialise un miroir local (slug hermes-agent).
 */
export {};

// Bun charge `.env.local` du répertoire courant : l'import dynamique doit venir
// après, pour que le module de seed voie déjà DATABASE_URL.
const { seedHermesAgentFromRuntime } = await import("../src/modules/agents/seed");

const result = await seedHermesAgentFromRuntime();
console.log(
  JSON.stringify(
    {
      ok: true,
      agentId: result.agent.id,
      name: result.agent.name,
      model: result.agent.model,
      hermes: result.hermes,
      archivedCount: result.archivedCount,
    },
    null,
    2,
  ),
);

process.exit(0);
