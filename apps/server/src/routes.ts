/**
 * Table de routage du serveur autonome.
 *
 * Les handlers viennent tels quels de `apps/web/src/app/api/**` : MESURÉ, aucun
 * d'eux n'importe `next/server` ni n'utilise `NextRequest`/`NextResponse`, ils
 * ne manipulent que les `Request`/`Response` standard du Web. Hono parle le
 * même dialecte, donc il n'y a rien à réécrire — seulement à monter.
 *
 * Les segments dynamiques passent de la syntaxe Next `[threadId]` à celle de
 * Hono `:threadId`. Les méthodes ne sont pas déclarées ici : on enregistre
 * celles que le module exporte réellement (cf. `mountRoute`).
 */

import * as agents from "@/app/api/agents/route";
import * as agentDetail from "@/app/api/agents/[agentId]/route";
import * as connectors from "@/app/api/connectors/route";
import * as connectorDetail from "@/app/api/connectors/[type]/route";
import * as connectorTest from "@/app/api/connectors/[type]/test/route";
import * as files from "@/app/api/files/route";
import * as fileDetail from "@/app/api/files/[fileId]/route";
import * as healthz from "@/app/api/healthz/route";
import * as readyz from "@/app/api/readyz/route";
import * as runApproval from "@/app/api/runs/[runId]/approval/route";
import * as runCancel from "@/app/api/runs/[runId]/cancel/route";
import * as runRetry from "@/app/api/runs/[runId]/retry/route";
import * as runtime from "@/app/api/runtime/route";
import * as runtimeModels from "@/app/api/runtime/models/route";
import * as providerCredentials from "@/app/api/runtime/providers/[provider]/credentials/route";
import * as codexAuth from "@/app/api/runtime/providers/openai-codex/auth/route";
import * as runtimeRestart from "@/app/api/runtime/restart/route";
import * as sshHosts from "@/app/api/runtime/ssh-hosts/route";
import * as runtimeTest from "@/app/api/runtime/test/route";
import * as threads from "@/app/api/threads/route";
import * as threadDetail from "@/app/api/threads/[threadId]/route";
import * as threadCommands from "@/app/api/threads/[threadId]/commands/route";
import * as threadEvents from "@/app/api/threads/[threadId]/events/route";
import * as threadMessages from "@/app/api/threads/[threadId]/messages/route";

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
