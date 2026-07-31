/**
 * L'arbre de routes, miroir de l'arborescence de fichiers qu'avait Next.
 *
 * Ce qui était implicite (un dossier = un segment, `layout.tsx` = une coque)
 * devient explicite ici. Les trois coques imbriquées sont des routes sans
 * chemin (`id` seul) : elles enveloppent leurs enfants sans consommer de
 * segment d'URL, exactement comme les `layout.tsx` qu'elles remplacent.
 */
import { lazy, Suspense } from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  Outlet,
} from "@tanstack/react-router";

import { AppProviders } from "@/components/providers/app-providers";
import { ConsoleShell } from "@/components/shell/console-shell";
import { SettingsNav } from "@/components/settings/settings-nav";
import { ChatSurfaceSkeleton } from "@/components/chat/chat-surface-skeleton";
import { usePathname } from "@/lib/router";
/**
 * Écrans de conversation, chargés à la demande.
 *
 * Ils tirent `assistant-ui` et son rendu markdown — 156 ko gzip, le plus gros
 * poste du bundle — alors qu'aucun d'eux n'est la route d'accueil. Les
 * différer sort ce poids du démarrage sans rien coûter à l'usage : le chunk
 * arrive pendant que la route se monte.
 *
 * `lazy` ne sait charger qu'un export par défaut, d'où le `.then` répété sur
 * chaque export nommé — un helper générique perdait le typage des props. La
 * frontière `Suspense` est unique, dans la coque Console.
 */
const ChatPane = lazy(() =>
  import("@/components/chat/openclaw-shell").then((m) => ({ default: m.ChatPane })),
);
const ChatSurfaceFrame = lazy(() =>
  import("@/components/chat/openclaw-shell").then((m) => ({
    default: m.ChatSurfaceFrame,
  })),
);
const OpenClawChatHome = lazy(() =>
  import("@/components/chat/openclaw-chat-home").then((m) => ({
    default: m.OpenClawChatHome,
  })),
);
const OpenClawNewSessionDraft = lazy(() =>
  import("@/components/chat/openclaw-new-draft").then((m) => ({
    default: m.OpenClawNewSessionDraft,
  })),
);
const RunScreen = lazy(() =>
  import("@/components/run/run-screen").then((m) => ({ default: m.RunScreen })),
);
import { RunForm } from "@/components/forms/run-form";
import { AgentForm } from "@/components/forms/agent-form";
import { AgentDetailClient } from "@/components/agents/agent-detail-client";
import { SettingsContent } from "@/components/settings/settings-content";
import { AppearanceSettings } from "@/components/settings/appearance-settings";
import { ConnectorsSettings } from "@/components/settings/connectors-settings";
import { ModelSettings } from "@/components/settings/model-settings";
import { NotificationsSettings } from "@/components/settings/notifications-settings";
import { Card, CardSurface, PageShell, SectionHeading } from "@/components/ui/boardui";

import { DashboardScreen } from "@/screens/dashboard";
import { MissionsScreen } from "@/screens/missions";
import { AgentsScreen } from "@/screens/agents";
import { ArtifactsScreen } from "@/screens/artifacts";
import { SupportScreen } from "@/screens/support";
import { SettingsHomeScreen } from "@/screens/settings-home";
import { SettingsRuntimeScreen } from "@/screens/settings-runtime";
import { SettingsRetentionScreen } from "@/screens/settings-retention";
import { SettingsSecurityScreen } from "@/screens/settings-security";
import { SetupScreen } from "@/screens/setup";
import { NotFoundScreen } from "@/screens/not-found";

import {
  loadAgent,
  loadAgents,
  loadArtifacts,
  loadDashboard,
  loadMissions,
  loadRetention,
  loadRuntime,
  loadSupport,
} from "@/loaders";

const rootRoute = createRootRoute({
  component: () => (
    <AppProviders>
      <Outlet />
    </AppProviders>
  ),
  notFoundComponent: NotFoundScreen,
});

/** `/setup` vivait hors du groupe `(console)` : pas de rail, pas de coque. */
const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/setup",
  component: SetupScreen,
});

// ── Coque Console : rail, palette ⌘K, fil d'ariane ───────────────────────────
const consoleLayout = createRoute({
  getParentRoute: () => rootRoute,
  id: "console",
  // Frontière unique pour tous les écrans différés : le rail et l'en-tête
  // restent affichés pendant que le chunk d'un écran arrive, au lieu de
  // blanchir la fenêtre entière.
  component: () => (
    <ConsoleShell>
      <Suspense fallback={<RouteFallback />}>
        <Outlet />
      </Suspense>
    </ConsoleShell>
  ),
});

function ErrorBox({ error }: { error: Error }) {
  return (
    <p role="alert" className="p-6 text-sm text-destructive">
      {error.message}
    </p>
  );
}

function Pending() {
  return <p className="p-6 text-sm text-muted-foreground">Chargement…</p>;
}

/**
 * La frontière `Suspense` est unique pour toute la Console, mais l'attente
 * qu'elle couvre n'a pas la même forme partout : sur le chat, le chunk différé
 * porte trois colonnes, et les remplacer par une ligne de texte faisait un
 * écran intermédiaire de plus. On choisit donc le repli selon la route.
 */
function RouteFallback() {
  const pathname = usePathname();
  return pathname === "/chat" || pathname.startsWith("/chat/") ? (
    <ChatSurfaceSkeleton />
  ) : (
    <Pending />
  );
}

const dashboardRoute = createRoute({
  getParentRoute: () => consoleLayout,
  path: "/",
  loader: loadDashboard,
  component: () => <DashboardScreen data={dashboardRoute.useLoaderData()} />,
  pendingComponent: Pending,
  errorComponent: ErrorBox,
});

// ── Missions ────────────────────────────────────────────────────────────────
const missionsRoute = createRoute({
  getParentRoute: () => consoleLayout,
  path: "/runs",
  validateSearch: (search: Record<string, unknown>) => ({
    filter: typeof search.filter === "string" ? search.filter : undefined,
    // Le kanban est la vue par défaut ; le tableau reste accessible par l'URL.
    view: search.view === "table" ? ("table" as const) : ("kanban" as const),
  }),
  loader: loadMissions,
  component: function MissionsRoute() {
    const { filter, view } = missionsRoute.useSearch();
    return <MissionsScreen data={missionsRoute.useLoaderData()} filter={filter} view={view} />;
  },
  pendingComponent: Pending,
  errorComponent: ErrorBox,
});

const newMissionRoute = createRoute({
  getParentRoute: () => consoleLayout,
  path: "/runs/new",
  component: () => (
    <PageShell className="max-w-4xl">
      <SectionHeading
        title="Confier une mission"
        description="Choisissez un agent, décrivez le résultat attendu et ajoutez les fichiers nécessaires."
      />
      <Card>
        <CardSurface>
          <RunForm />
        </CardSurface>
      </Card>
    </PageShell>
  ),
});

const missionDetailRoute = createRoute({
  getParentRoute: () => consoleLayout,
  path: "/runs/$runId",
  component: function MissionDetailRoute() {
    const { runId } = missionDetailRoute.useParams();
    return <RunScreen runId={runId} />;
  },
});

// ── Agents ──────────────────────────────────────────────────────────────────
const agentsRoute = createRoute({
  getParentRoute: () => consoleLayout,
  path: "/agents",
  loader: loadAgents,
  component: () => <AgentsScreen data={agentsRoute.useLoaderData()} />,
  pendingComponent: Pending,
  errorComponent: ErrorBox,
});

const newAgentRoute = createRoute({
  getParentRoute: () => consoleLayout,
  path: "/agents/new",
  component: () => (
    <PageShell className="max-w-4xl">
      <SectionHeading
        title="Définir un agent"
        description="La configuration appartient à Hermes Console. Elle sera injectée dans le prompt système lors du lancement."
      />
      <Card>
        <CardSurface>
          <AgentForm />
        </CardSurface>
      </Card>
    </PageShell>
  ),
});

const agentDetailRoute = createRoute({
  getParentRoute: () => consoleLayout,
  path: "/agents/$agentId",
  loader: ({ params }) => loadAgent(params.agentId),
  component: () => <AgentDetailClient agent={agentDetailRoute.useLoaderData().agent} />,
  pendingComponent: Pending,
  // Un agent inexistant renvoyait `notFound()` côté Next ; le loader lève une
  // ApiError 404 et l'écran d'erreur porte le message du serveur.
  errorComponent: ErrorBox,
});

// ── Artefacts, Support ──────────────────────────────────────────────────────
const artifactsRoute = createRoute({
  getParentRoute: () => consoleLayout,
  path: "/artifacts",
  loader: loadArtifacts,
  component: () => <ArtifactsScreen data={artifactsRoute.useLoaderData()} />,
  pendingComponent: Pending,
  errorComponent: ErrorBox,
});

const supportRoute = createRoute({
  getParentRoute: () => consoleLayout,
  path: "/support",
  loader: loadSupport,
  component: () => <SupportScreen data={supportRoute.useLoaderData()} />,
  pendingComponent: Pending,
  errorComponent: ErrorBox,
});

// ── Chat : coque propre, pour que changer de session ne remonte pas la sidebar ─
const chatLayout = createRoute({
  getParentRoute: () => consoleLayout,
  id: "chat",
  component: () => (
    <ChatSurfaceFrame>
      <Outlet />
    </ChatSurfaceFrame>
  ),
});

const chatHomeRoute = createRoute({
  getParentRoute: () => chatLayout,
  path: "/chat",
  component: () => (
    <ChatPane title="Chat">
      <OpenClawChatHome />
    </ChatPane>
  ),
});

const chatNewRoute = createRoute({
  getParentRoute: () => chatLayout,
  path: "/chat/new",
  component: () => (
    <ChatPane title="New session">
      <OpenClawNewSessionDraft />
    </ChatPane>
  ),
});

const chatSessionRoute = createRoute({
  getParentRoute: () => chatLayout,
  path: "/chat/$sessionId",
  component: function ChatSessionRoute() {
    const { sessionId } = chatSessionRoute.useParams();
    return <RunScreen runId={sessionId} surface="chat" />;
  },
});

/**
 * Redirections héritées de `next.config.ts`. D'anciens liens et signets
 * pointent encore sur `/chat/sessions/...` ; les casser serait une régression
 * silencieuse pour l'utilisateur.
 */
const legacyChatRoutes = (
  [
    ["/chat/sessions", "/chat"],
    ["/chat/sessions/new", "/chat/new"],
    ["/chat/session", "/chat"],
    ["/chat/session/new", "/chat/new"],
  ] as const
).map(([from, to]) =>
  createRoute({
    getParentRoute: () => consoleLayout,
    path: from,
    beforeLoad: () => {
      throw redirect({ to, replace: true });
    },
  }),
);

const legacyChatSessionRoute = createRoute({
  getParentRoute: () => consoleLayout,
  path: "/chat/sessions/$sessionId",
  beforeLoad: ({ params }) => {
    throw redirect({ to: `/chat/${params.sessionId}` as never, replace: true });
  },
});

const legacyChatSessionSingularRoute = createRoute({
  getParentRoute: () => consoleLayout,
  path: "/chat/session/$sessionId",
  beforeLoad: ({ params }) => {
    throw redirect({ to: `/chat/${params.sessionId}` as never, replace: true });
  },
});

// ── Paramètres : colonne de navigation partagée ─────────────────────────────
const settingsLayout = createRoute({
  getParentRoute: () => consoleLayout,
  id: "settings",
  component: () => (
    <div className="flex w-full flex-1 flex-col gap-4 p-4 lg:flex-row lg:gap-8 lg:p-6">
      <SettingsNav className="lg:w-52 lg:shrink-0" />
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  ),
});

const settingsHomeRoute = createRoute({
  getParentRoute: () => settingsLayout,
  path: "/settings",
  loader: loadRuntime,
  component: () => <SettingsHomeScreen data={settingsHomeRoute.useLoaderData()} />,
  pendingComponent: Pending,
  errorComponent: ErrorBox,
});

const settingsRuntimeRoute = createRoute({
  getParentRoute: () => settingsLayout,
  path: "/settings/runtime",
  component: SettingsRuntimeScreen,
});

const settingsModelsRoute = createRoute({
  getParentRoute: () => settingsLayout,
  path: "/settings/models",
  component: () => (
    <SettingsContent>
      <SectionHeading
        title="Modèles"
        description="Provider LLM, clé API et modèle par défaut pour les prochaines missions."
      />
      <ModelSettings />
    </SettingsContent>
  ),
});

const settingsConnectorsRoute = createRoute({
  getParentRoute: () => settingsLayout,
  path: "/settings/connectors",
  component: ConnectorsSettings,
});

const settingsAppearanceRoute = createRoute({
  getParentRoute: () => settingsLayout,
  path: "/settings/appearance",
  component: () => (
    <SettingsContent>
      <SectionHeading
        title="Apparence"
        description="Thème, disposition et dimensions de l’interface Console."
      />
      <AppearanceSettings />
    </SettingsContent>
  ),
});

const settingsNotificationsRoute = createRoute({
  getParentRoute: () => settingsLayout,
  path: "/settings/notifications",
  component: () => (
    <SettingsContent>
      <SectionHeading
        title="Notifications"
        description="Choisissez quand être alerté pendant et après une mission."
      />
      <NotificationsSettings />
    </SettingsContent>
  ),
});

const settingsRetentionRoute = createRoute({
  getParentRoute: () => settingsLayout,
  path: "/settings/retention",
  loader: loadRetention,
  component: () => (
    <SettingsRetentionScreen data={settingsRetentionRoute.useLoaderData()} />
  ),
  pendingComponent: Pending,
  errorComponent: ErrorBox,
});

const settingsSecurityRoute = createRoute({
  getParentRoute: () => settingsLayout,
  path: "/settings/security",
  loader: loadRuntime,
  component: () => <SettingsSecurityScreen data={settingsSecurityRoute.useLoaderData()} />,
  pendingComponent: Pending,
  errorComponent: ErrorBox,
});

export const routeTree = rootRoute.addChildren([
  setupRoute,
  consoleLayout.addChildren([
    dashboardRoute,
    missionsRoute,
    newMissionRoute,
    missionDetailRoute,
    agentsRoute,
    newAgentRoute,
    agentDetailRoute,
    artifactsRoute,
    supportRoute,
    chatLayout.addChildren([chatHomeRoute, chatNewRoute, chatSessionRoute]),
    ...legacyChatRoutes,
    legacyChatSessionRoute,
    legacyChatSessionSingularRoute,
    settingsLayout.addChildren([
      settingsHomeRoute,
      settingsRuntimeRoute,
      settingsModelsRoute,
      settingsConnectorsRoute,
      settingsAppearanceRoute,
      settingsNotificationsRoute,
      settingsRetentionRoute,
      settingsSecurityRoute,
    ]),
  ]),
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultNotFoundComponent: NotFoundScreen,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
