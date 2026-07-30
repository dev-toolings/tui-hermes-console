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
import * as agentDetail from "@/api/agents/[agentId]/route";
import * as connectors from "@/api/connectors/route";
import * as connectorDetail from "@/api/connectors/[type]/route";
import * as connectorTest from "@/api/connectors/[type]/test/route";
import * as files from "@/api/files/route";
import * as fileDetail from "@/api/files/[fileId]/route";
import * as healthz from "@/api/healthz/route";
import * as readyz from "@/api/readyz/route";
import * as runApproval from "@/api/runs/[runId]/approval/route";
import * as runCancel from "@/api/runs/[runId]/cancel/route";
import * as runRetry from "@/api/runs/[runId]/retry/route";
import * as runtime from "@/api/runtime/route";
import * as runtimeModels from "@/api/runtime/models/route";
import * as providerCredentials from "@/api/runtime/providers/[provider]/credentials/route";
import * as codexAuth from "@/api/runtime/providers/openai-codex/auth/route";
import * as runtimeRestart from "@/api/runtime/restart/route";
import * as sshHosts from "@/api/runtime/ssh-hosts/route";
import * as runtimeTest from "@/api/runtime/test/route";
import * as threads from "@/api/threads/route";
import * as threadDetail from "@/api/threads/[threadId]/route";
import * as threadCommands from "@/api/threads/[threadId]/commands/route";
import * as threadEvents from "@/api/threads/[threadId]/events/route";
import * as threadMessages from "@/api/threads/[threadId]/messages/route";

export type RouteModule = Record<string, unknown>;

export const ROUTES: Array<{ path: string; module: RouteModule }> = [
  { path: "/api/healthz", module: healthz },
  { path: "/api/readyz", module: readyz },

  { path: "/api/agents", module: agents },
  { path: "/api/agents/:agentId", module: agentDetail },

  { path: "/api/connectors", module: connectors },
  { path: "/api/connectors/:type", module: connectorDetail },
  { path: "/api/connectors/:type/test", module: connectorTest },

  { path: "/api/files", module: files },
  { path: "/api/files/:fileId", module: fileDetail },

  { path: "/api/runs/:runId/approval", module: runApproval },
  { path: "/api/runs/:runId/cancel", module: runCancel },
  { path: "/api/runs/:runId/retry", module: runRetry },

  { path: "/api/runtime", module: runtime },
  { path: "/api/runtime/models", module: runtimeModels },
  { path: "/api/runtime/restart", module: runtimeRestart },
  { path: "/api/runtime/ssh-hosts", module: sshHosts },
  { path: "/api/runtime/test", module: runtimeTest },
  // Avant `/:provider/credentials` : Hono retient la première correspondance,
  // et « openai-codex » matcherait le motif paramétré.
  { path: "/api/runtime/providers/openai-codex/auth", module: codexAuth },
  { path: "/api/runtime/providers/:provider/credentials", module: providerCredentials },

  { path: "/api/threads", module: threads },
  { path: "/api/threads/:threadId", module: threadDetail },
  { path: "/api/threads/:threadId/commands", module: threadCommands },
  { path: "/api/threads/:threadId/events", module: threadEvents },
  { path: "/api/threads/:threadId/messages", module: threadMessages },
];
