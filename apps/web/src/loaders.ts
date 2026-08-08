/**
 * Les `loader` des routes.
 *
 * Un par écran qui avait besoin de données au rendu. Sous Next, ces appels
 * étaient des accès Postgres directs dans le corps du composant serveur ; ici
 * ils partent en HTTP avant que la route ne se monte, ce qui évite le
 * clignotement « squelette puis contenu » d'un fetch dans useEffect.
 */
import {
  ApiError,
  fetchAchievements,
  fetchAchievementsScanStatus,
  fetchActivity,
  fetchAgent,
  fetchAgents,
  fetchArtifacts,
  fetchAuditEntries,
  fetchHermesUpdates,
  fetchLifecyclePolicy,
  fetchRuntime,
  fetchRuntimeProbe,
  fetchSkills,
  fetchStorage,
  fetchThreads,
} from "@/lib/api";
import { readPersonaCapabilities } from "@/lib/persona-capabilities";

export async function loadDashboard() {
  const [agents, threads, activity] = await Promise.all([
    readPersonaCapabilities().has("agent.read") ? fetchAgents() : Promise.resolve([]),
    // `mission` et pas tout : l'Aperçu compte des missions, pas des chats.
    fetchThreads("mission"),
    fetchActivity(30),
  ]);
  return { agents, threads, activity };
}
export type DashboardData = Awaited<ReturnType<typeof loadDashboard>>;

export async function loadMissions() {
  return { threads: await fetchThreads("mission") };
}
export type MissionsData = Awaited<ReturnType<typeof loadMissions>>;

export async function loadSessions() {
  return { threads: await fetchThreads("all") };
}
export type SessionsData = Awaited<ReturnType<typeof loadSessions>>;

export async function loadAudit() {
  return { entries: await fetchAuditEntries(200) };
}
export type AuditData = Awaited<ReturnType<typeof loadAudit>>;

export async function loadAgents() {
  return { agents: await fetchAgents(true) };
}
export type AgentsData = Awaited<ReturnType<typeof loadAgents>>;

export async function loadSkills() {
  return fetchSkills();
}
export type SkillsData = Awaited<ReturnType<typeof loadSkills>>;

export async function loadAchievements() {
  const [achievements, scanStatus] = await Promise.all([
    fetchAchievements(),
    fetchAchievementsScanStatus(),
  ]);
  return { achievements, scanStatus };
}
export type AchievementsData = Awaited<ReturnType<typeof loadAchievements>>;

export async function loadAgent(agentId: string) {
  return { agent: await fetchAgent(agentId) };
}
export type AgentData = Awaited<ReturnType<typeof loadAgent>>;

export async function loadArtifacts() {
  return { artifacts: await fetchArtifacts() };
}
export type ArtifactsData = Awaited<ReturnType<typeof loadArtifacts>>;

export async function loadHermesUpdates() {
  return { releases: await fetchHermesUpdates(20) };
}
export type HermesUpdatesData = Awaited<ReturnType<typeof loadHermesUpdates>>;

export async function loadRuntime() {
  return { runtime: await fetchRuntime() };
}
export type RuntimeData = Awaited<ReturnType<typeof loadRuntime>>;

export async function loadSupport() {
  const [runtimeResult, probeResult] = await Promise.allSettled([
    fetchRuntime(),
    fetchRuntimeProbe(),
  ]);
  return {
    runtime: runtimeResult.status === "fulfilled" ? runtimeResult.value : null,
    probe: probeResult.status === "fulfilled" ? probeResult.value : null,
  };
}
export type SupportData = Awaited<ReturnType<typeof loadSupport>>;

export async function loadRetention() {
  const storage = await fetchStorage();
  if (!readPersonaCapabilities().has("data.lifecycle.read")) {
    return { ...storage, policy: null };
  }
  try {
    return { ...storage, policy: await fetchLifecyclePolicy() };
  } catch (error) {
    if (error instanceof ApiError && error.code === "LIFECYCLE_POLICY_REQUIRED") {
      return { ...storage, policy: null };
    }
    throw error;
  }
}
export type RetentionData = Awaited<ReturnType<typeof loadRetention>>;
