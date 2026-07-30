/**
 * Les `loader` des routes.
 *
 * Un par écran qui avait besoin de données au rendu. Sous Next, ces appels
 * étaient des accès Postgres directs dans le corps du composant serveur ; ici
 * ils partent en HTTP avant que la route ne se monte, ce qui évite le
 * clignotement « squelette puis contenu » d'un fetch dans useEffect.
 */
import {
  fetchActivity,
  fetchAgent,
  fetchAgents,
  fetchArtifacts,
  fetchRuntime,
  fetchRuntimeProbe,
  fetchStorage,
  fetchThreads,
} from "@/lib/api";

export async function loadDashboard() {
  const [agents, threads, runtime, activity] = await Promise.all([
    fetchAgents(),
    // `mission` et pas tout : l'Aperçu compte des missions, pas des chats.
    fetchThreads("mission"),
    fetchRuntime(),
    fetchActivity(30),
  ]);
  return { agents, threads, runtime, activity };
}
export type DashboardData = Awaited<ReturnType<typeof loadDashboard>>;

export async function loadMissions() {
  return { threads: await fetchThreads("mission") };
}
export type MissionsData = Awaited<ReturnType<typeof loadMissions>>;

export async function loadAgents() {
  return { agents: await fetchAgents() };
}
export type AgentsData = Awaited<ReturnType<typeof loadAgents>>;

export async function loadAgent(agentId: string) {
  return { agent: await fetchAgent(agentId) };
}
export type AgentData = Awaited<ReturnType<typeof loadAgent>>;

export async function loadArtifacts() {
  return { artifacts: await fetchArtifacts() };
}
export type ArtifactsData = Awaited<ReturnType<typeof loadArtifacts>>;

export async function loadRuntime() {
  return { runtime: await fetchRuntime() };
}
export type RuntimeData = Awaited<ReturnType<typeof loadRuntime>>;

export async function loadSupport() {
  const [runtime, probe] = await Promise.all([fetchRuntime(), fetchRuntimeProbe()]);
  return { runtime, probe };
}
export type SupportData = Awaited<ReturnType<typeof loadSupport>>;

export async function loadRetention() {
  return fetchStorage();
}
export type RetentionData = Awaited<ReturnType<typeof loadRetention>>;
