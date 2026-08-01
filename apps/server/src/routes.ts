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
import * as runtimeModels from "@/api/runtime/models/route";
import * as runtimeProbe from "@/api/runtime/probe/route";
import * as providerCredentials from "@/api/runtime/providers/[provider]/credentials/route";
import * as codexAuth from "@/api/runtime/providers/openai-codex/auth/route";
import * as runtimeRestart from "@/api/runtime/restart/route";
import * as sshHosts from "@/api/runtime/ssh-hosts/route";
import * as runtimeTest from "@/api/runtime/test/route";
import * as settingsStorage from "@/api/settings/storage/route";
import * as setup from "@/api/setup/route";
import * as threads from "@/api/threads/route";
import * as threadDetail from "@/api/threads/[threadId]/route";
import * as threadCommands from "@/api/threads/[threadId]/commands/route";
import * as threadEvents from "@/api/threads/[threadId]/events/route";
import * as threadMessages from "@/api/threads/[threadId]/messages/route";
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
  },

  {
    path: "/api/settings/storage",
    module: settingsStorage,
    access: siteAccess({ GET: "storage.read" }),
  },

  { path: "/api/runtime", module: runtime, access: installationAccess },
  { path: "/api/runtime/models", module: runtimeModels, access: installationAccess },
  { path: "/api/runtime/probe", module: runtimeProbe, access: installationAccess },
  { path: "/api/runtime/restart", module: runtimeRestart, access: installationAccess },
  { path: "/api/runtime/ssh-hosts", module: sshHosts, access: installationAccess },
  { path: "/api/runtime/test", module: runtimeTest, access: installationAccess },
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
  },
];
