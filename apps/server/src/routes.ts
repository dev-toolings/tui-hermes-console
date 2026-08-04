/**
 * Table de routage du serveur autonome.
 *
 * Les handlers de `src/api/**` ne manipulent que les `Request`/`Response`
 * standard du Web — c'est ce qui a permis de les reprendre tels quels quand
 * Next a été retiré, sans en réécrire un seul.
 *
 * Les dossiers gardent la syntaxe `[threadId]` ; les chemins montés utilisent
 * celle de Hono, `:threadId`. Les méthodes ne sont pas déclarées ici : on
 * enregistre celles que le module exporte réellement (cf. `mountRoute`).
 */

import * as agents from "@/api/agents/route";
import * as skills from "@/api/skills/route";
import * as skillToggle from "@/api/skills/toggle/route";
import * as audit from "@/api/audit/route";
import * as auditExports from "@/api/audit/exports/route";
import * as auth from "@/api/auth/route";
import * as agentDetail from "@/api/agents/[agentId]/route";
import * as connectors from "@/api/connectors/route";
import * as connectorDetail from "@/api/connectors/[type]/route";
import * as connectorTest from "@/api/connectors/[type]/test/route";
import * as files from "@/api/files/route";
import * as fileDetail from "@/api/files/[fileId]/route";
import * as healthz from "@/api/healthz/route";
import * as readyz from "@/api/readyz/route";
import * as runActivity from "@/api/runs/activity/route";
import * as runApproval from "@/api/runs/[runId]/approval/route";
import * as runCancel from "@/api/runs/[runId]/cancel/route";
import * as runRetry from "@/api/runs/[runId]/retry/route";
import * as runtime from "@/api/runtime/route";
import * as runtimeAchievements from "@/api/runtime/achievements/route";
import * as runtimeAchievementsScanStatus from "@/api/runtime/achievements/scan-status/route";
import * as runtimeDashboard from "@/api/runtime/dashboard/route";
import * as runtimeModels from "@/api/runtime/models/route";
import * as runtimeProbe from "@/api/runtime/probe/route";
import * as runtimeEvents from "@/api/runtime/events/route";
import * as providerCredentials from "@/api/runtime/providers/[provider]/credentials/route";
import * as codexAuth from "@/api/runtime/providers/openai-codex/auth/route";
import * as runtimeRestart from "@/api/runtime/restart/route";
import * as runtimeUpdate from "@/api/runtime/update/route";
import * as runtimeUpdateOperation from "@/api/runtime/update/[operationId]/route";
import * as runtimeUpdateOperationEvents from "@/api/runtime/update/[operationId]/events/route";
import * as runtimeCredentials from "@/api/runtime/credentials/route";
import * as runtimeCredentialPlan from "@/api/runtime/credentials/plan/route";
import * as runtimeCredentialOperation from "@/api/runtime/credentials/[operationId]/route";
import * as sshHosts from "@/api/runtime/ssh-hosts/route";
import * as runtimeTest from "@/api/runtime/test/route";
import * as runtimeSshConnect from "@/api/runtime/ssh/connect/route";
import * as runtimeSshWorkspaceDiscover from "@/api/runtime/ssh/workspace/discover/route";
import * as runtimeSshWorkspaceCheck from "@/api/runtime/ssh/workspace/check/route";
import * as runtimeSshWorkspace from "@/api/runtime/ssh/workspace/route";
import * as runtimeSshHostKeyScan from "@/api/runtime/ssh/host-key/scan/route";
import * as runtimeSshHostKey from "@/api/runtime/ssh/host-key/route";
import * as runtimeSshPlan from "@/api/runtime/ssh/plan/route";
import * as runtimeSshProvision from "@/api/runtime/ssh/provision/route";
import * as runtimeSshProvisionEvents from "@/api/runtime/ssh/provision/[jobId]/events/route";
import * as runtimeSshStorageMigrationPlan from "@/api/runtime/ssh/storage-migration/plan/route";
import * as runtimeSshStorageMigration from "@/api/runtime/ssh/storage-migration/route";
import * as runtimeSshStorageMigrationJob from "@/api/runtime/ssh/storage-migration/[jobId]/route";
import * as runtimeSshStorageMigrationEvents from "@/api/runtime/ssh/storage-migration/[jobId]/events/route";
import * as settingsStorage from "@/api/settings/storage/route";
import * as settingsDataLifecycle from "@/api/settings/data-lifecycle/route";
import * as settingsDataLifecyclePreviews from "@/api/settings/data-lifecycle/previews/route";
import * as settingsDataLifecyclePreview from "@/api/settings/data-lifecycle/previews/[previewId]/route";
import * as settingsDataLifecycleExports from "@/api/settings/data-lifecycle/exports/route";
import * as settingsDataLifecyclePurges from "@/api/settings/data-lifecycle/purges/route";
import * as setup from "@/api/setup/route";
import * as threads from "@/api/threads/route";
import * as threadDetail from "@/api/threads/[threadId]/route";
import * as threadCommands from "@/api/threads/[threadId]/commands/route";
import * as threadEvents from "@/api/threads/[threadId]/events/route";
import * as threadMessages from "@/api/threads/[threadId]/messages/route";
import * as updatesHermes from "@/api/updates/hermes/route";
import * as siteMembership from "@/api/site/memberships/[userId]/route";
import * as siteMemberships from "@/api/site/memberships/route";
import * as siteMandates from "@/api/site/mandates/route";
import * as siteMandate from "@/api/site/mandates/[mandateId]/route";
import * as siteMandateAssignments from "@/api/site/mandates/[mandateId]/assignments/route";
import * as siteMandateAssignment from "@/api/site/mandates/[mandateId]/assignments/[userId]/route";
import * as ownership from "@/api/ownership/[resourceType]/[resourceId]/route";
import type { SiteAction } from "@/modules/auth/site-authorization";

export type RouteModule = Record<string, unknown>;

export const ROUTE_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type RouteMethod = (typeof ROUTE_METHODS)[number];

export type RouteAccess =
  | { boundary: "public" }
  | { boundary: "setup" }
  | { boundary: "installation" }
  | {
      boundary: "site";
      actions: Partial<Record<RouteMethod, SiteAction>>;
    };

export type RouteDefinition = {
  path: string;
  module: RouteModule;
  access: RouteAccess;
  /** Mounted methods that must pass the current AI disclosure boundary. */
  requiresAiConsent?: Partial<Record<RouteMethod, true>>;
};

const publicAccess = { boundary: "public" } as const;
const setupAccess = { boundary: "setup" } as const;
const installationAccess = { boundary: "installation" } as const;
const siteAccess = (
  actions: Partial<Record<RouteMethod, SiteAction>>,
): RouteAccess => ({ boundary: "site", actions });

export const ROUTES: RouteDefinition[] = [
  { path: "/api/healthz", module: healthz, access: publicAccess },
  { path: "/api/readyz", module: readyz, access: publicAccess },
  { path: "/api/auth", module: auth, access: publicAccess },
  { path: "/api/setup", module: setup, access: setupAccess },

  {
    path: "/api/audit",
    module: audit,
    access: siteAccess({ GET: "audit.read" }),
  },
  {
    path: "/api/audit/exports",
    module: auditExports,
    access: siteAccess({ POST: "audit.export" }),
  },
  {
    path: "/api/site/memberships",
    module: siteMemberships,
    access: siteAccess({ GET: "membership.manage" }),
  },
  {
    path: "/api/site/memberships/:userId",
    module: siteMembership,
    access: siteAccess({ PUT: "membership.manage" }),
  },
  {
    path: "/api/site/mandates",
    module: siteMandates,
    access: siteAccess({ GET: "membership.manage", POST: "membership.manage" }),
  },
  {
    path: "/api/site/mandates/:mandateId",
    module: siteMandate,
    access: siteAccess({ DELETE: "membership.manage" }),
  },
  {
    path: "/api/site/mandates/:mandateId/assignments",
    module: siteMandateAssignments,
    access: siteAccess({ POST: "membership.manage" }),
  },
  {
    path: "/api/site/mandates/:mandateId/assignments/:userId",
    module: siteMandateAssignment,
    access: siteAccess({ DELETE: "membership.manage" }),
  },
  {
    path: "/api/ownership/:resourceType/:resourceId",
    module: ownership,
    access: siteAccess({ PUT: "ownership.transfer" }),
  },

  {
    path: "/api/agents",
    module: agents,
    access: siteAccess({ GET: "agent.read", POST: "agent.create" }),
  },
  {
    path: "/api/agents/:agentId",
    module: agentDetail,
    access: siteAccess({
      GET: "agent.read",
      PATCH: "agent.update",
      DELETE: "agent.delete",
    }),
  },
  {
    path: "/api/skills",
    module: skills,
    access: siteAccess({ GET: "agent.read" }),
  },
  {
    path: "/api/skills/toggle",
    module: skillToggle,
    access: siteAccess({ PUT: "agent.update" }),
  },

  {
    path: "/api/connectors",
    module: connectors,
    access: siteAccess({ GET: "connector.read" }),
  },
  {
    path: "/api/connectors/:type",
    module: connectorDetail,
    access: siteAccess({ PUT: "connector.upsert", DELETE: "connector.delete" }),
  },
  {
    path: "/api/connectors/:type/test",
    module: connectorTest,
    access: siteAccess({ POST: "connector.test" }),
  },

  {
    path: "/api/files",
    module: files,
    access: siteAccess({ GET: "artifact.read", POST: "artifact.create" }),
  },
  {
    path: "/api/files/:fileId",
    module: fileDetail,
    access: siteAccess({ GET: "artifact.read" }),
  },

  // Avant `/:runId/…` : « activity » matcherait le motif paramétré.
  {
    path: "/api/runs/activity",
    module: runActivity,
    access: siteAccess({ GET: "run.read" }),
  },
  {
    path: "/api/runs/:runId/approval",
    module: runApproval,
    access: siteAccess({ POST: "run.approve" }),
  },
  {
    path: "/api/runs/:runId/cancel",
    module: runCancel,
    access: siteAccess({ POST: "run.cancel" }),
  },
  {
    path: "/api/runs/:runId/retry",
    module: runRetry,
    access: siteAccess({ POST: "run.retry" }),
    requiresAiConsent: { POST: true },
  },

  {
    path: "/api/settings/storage",
    module: settingsStorage,
    access: siteAccess({ GET: "storage.read" }),
  },
  {
    path: "/api/settings/data-lifecycle",
    module: settingsDataLifecycle,
    access: siteAccess({
      GET: "data.lifecycle.read",
      PUT: "data.lifecycle.manage",
    }),
  },
  {
    path: "/api/settings/data-lifecycle/previews",
    module: settingsDataLifecyclePreviews,
    access: siteAccess({ POST: "data.lifecycle.preview" }),
  },
  {
    path: "/api/settings/data-lifecycle/previews/:previewId",
    module: settingsDataLifecyclePreview,
    access: siteAccess({ GET: "data.lifecycle.preview" }),
  },
  {
    path: "/api/settings/data-lifecycle/exports",
    module: settingsDataLifecycleExports,
    access: siteAccess({ POST: "data.lifecycle.export" }),
  },
  {
    path: "/api/settings/data-lifecycle/purges",
    module: settingsDataLifecyclePurges,
    access: siteAccess({ POST: "data.lifecycle.purge" }),
  },

  { path: "/api/runtime", module: runtime, access: installationAccess },
  {
    path: "/api/runtime/achievements",
    module: runtimeAchievements,
    access: siteAccess({ GET: "agent.read" }),
  },
  {
    path: "/api/runtime/achievements/scan-status",
    module: runtimeAchievementsScanStatus,
    access: siteAccess({ GET: "agent.read" }),
  },
  { path: "/api/runtime/dashboard", module: runtimeDashboard, access: installationAccess },
  { path: "/api/runtime/models", module: runtimeModels, access: installationAccess },
  { path: "/api/runtime/probe", module: runtimeProbe, access: installationAccess },
  { path: "/api/runtime/events", module: runtimeEvents, access: installationAccess },
  { path: "/api/runtime/restart", module: runtimeRestart, access: installationAccess },
  { path: "/api/runtime/update", module: runtimeUpdate, access: installationAccess },
  { path: "/api/runtime/update/:operationId", module: runtimeUpdateOperation, access: installationAccess },
  { path: "/api/runtime/update/:operationId/events", module: runtimeUpdateOperationEvents, access: installationAccess },
  { path: "/api/runtime/credentials", module: runtimeCredentials, access: installationAccess },
  { path: "/api/runtime/credentials/plan", module: runtimeCredentialPlan, access: installationAccess },
  { path: "/api/runtime/credentials/:operationId", module: runtimeCredentialOperation, access: installationAccess },
  { path: "/api/runtime/ssh-hosts", module: sshHosts, access: installationAccess },
  { path: "/api/runtime/test", module: runtimeTest, access: installationAccess },
  { path: "/api/runtime/ssh/connect", module: runtimeSshConnect, access: installationAccess },
  { path: "/api/runtime/ssh/workspace/discover", module: runtimeSshWorkspaceDiscover, access: installationAccess },
  { path: "/api/runtime/ssh/workspace/check", module: runtimeSshWorkspaceCheck, access: installationAccess },
  { path: "/api/runtime/ssh/workspace", module: runtimeSshWorkspace, access: installationAccess },
  { path: "/api/runtime/ssh/host-key/scan", module: runtimeSshHostKeyScan, access: installationAccess },
  { path: "/api/runtime/ssh/host-key", module: runtimeSshHostKey, access: installationAccess },
  { path: "/api/runtime/ssh/plan", module: runtimeSshPlan, access: installationAccess },
  { path: "/api/runtime/ssh/provision", module: runtimeSshProvision, access: installationAccess },
  { path: "/api/runtime/ssh/provision/:jobId/events", module: runtimeSshProvisionEvents, access: installationAccess },
  { path: "/api/runtime/ssh/storage-migration/plan", module: runtimeSshStorageMigrationPlan, access: installationAccess },
  { path: "/api/runtime/ssh/storage-migration", module: runtimeSshStorageMigration, access: installationAccess },
  { path: "/api/runtime/ssh/storage-migration/:jobId", module: runtimeSshStorageMigrationJob, access: installationAccess },
  { path: "/api/runtime/ssh/storage-migration/:jobId/events", module: runtimeSshStorageMigrationEvents, access: installationAccess },
  // Avant `/:provider/credentials` : Hono retient la première correspondance,
  // et « openai-codex » matcherait le motif paramétré.
  {
    path: "/api/runtime/providers/openai-codex/auth",
    module: codexAuth,
    access: installationAccess,
  },
  {
    path: "/api/runtime/providers/:provider/credentials",
    module: providerCredentials,
    access: installationAccess,
  },

  {
    path: "/api/threads",
    module: threads,
    access: siteAccess({ GET: "thread.read", POST: "thread.create" }),
    requiresAiConsent: { POST: true },
  },
  {
    path: "/api/threads/:threadId",
    module: threadDetail,
    access: siteAccess({ GET: "thread.read", DELETE: "thread.delete" }),
  },
  {
    path: "/api/threads/:threadId/commands",
    module: threadCommands,
    access: siteAccess({ POST: "thread.command" }),
  },
  {
    path: "/api/threads/:threadId/events",
    module: threadEvents,
    access: siteAccess({ GET: "thread.events.read" }),
  },
  {
    path: "/api/threads/:threadId/messages",
    module: threadMessages,
    access: siteAccess({ POST: "thread.message" }),
    requiresAiConsent: { POST: true },
  },
  {
    path: "/api/updates/hermes",
    module: updatesHermes,
    access: siteAccess({ GET: "run.read" }),
  },
];

function routePathMatches(routePath: string, requestPath: string) {
  const routeSegments = routePath.split("/").filter(Boolean);
  const requestSegments = requestPath.split("/").filter(Boolean);
  if (routeSegments.length !== requestSegments.length) return false;
  return routeSegments.every(
    (segment, index) => segment.startsWith(":") || segment === requestSegments[index],
  );
}

/** Resolves consent from the mounted route manifest, not a second path regex list. */
export function routeRequiresAiConsent(method: string, requestPath: string) {
  const normalizedMethod = method.toUpperCase();
  if (!(ROUTE_METHODS as readonly string[]).includes(normalizedMethod)) return false;
  return ROUTES.some(
    (route) =>
      route.requiresAiConsent?.[normalizedMethod as RouteMethod] === true &&
      routePathMatches(route.path, requestPath),
  );
}
