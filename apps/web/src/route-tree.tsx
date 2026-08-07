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
import { OpenClawChatHome } from "@/components/chat/openclaw-chat-home";
import { OpenClawNewSessionDraft } from "@/components/chat/openclaw-new-draft";
import { usePathname } from "@/lib/router";
import { siteAccessBlock, type AuthSiteContext } from "@/lib/auth-site-context";
import { setSessionCacheScope } from "@/lib/session-cache-scope";
import { setPersonaCapabilities, setPersonaRole } from "@/lib/persona-capabilities";
/**
 * Écrans de conversation, chargés à la demande.
 *
 * Ils tirent `assistant-ui` et son rendu markdown — 156 ko gzip, le plus gros
 * poste du bundle — alors qu'aucun d'eux n'est la route d'accueil. Les
 * différer sort ce poids du démarrage sans rien coûter à l'usage : le chunk
 * arrive pendant que la route se monte.
 *
 * L'accueil `/chat` et le brouillon `/chat/new`, qui n'attendent aucune donnée
 * de conversation, restent synchrones afin qu'une navigation entre eux ne
 * suspende jamais toute la surface.
 * `lazy` ne sait charger qu'un export par défaut, d'où le `.then` répété sur
 * chaque export nommé. La frontière `Suspense` est unique, dans la coque Console.
 */
const ChatPane = lazy(() =>
  import("@/components/chat/openclaw-shell").then((m) => ({ default: m.ChatPane })),
);
const ChatSurfaceFrame = lazy(() =>
  import("@/components/chat/openclaw-shell").then((m) => ({
    default: m.ChatSurfaceFrame,
  })),
);
const InstallationGuideScreen = lazy(() =>
  import("@/screens/installation-guide").then((m) => ({
    default: m.InstallationGuideScreen,
  })),
);
const RunScreen = lazy(() =>
  import("@/components/run/run-screen").then((m) => ({ default: m.RunScreen })),
);
import { AgentForm } from "@/components/forms/agent-form";
import { AgentDetailClient } from "@/components/agents/agent-detail-client";
import { SettingsContent } from "@/components/settings/settings-content";
import { AppearanceSettings } from "@/components/settings/appearance-settings";
import { ConnectorsSettings } from "@/components/settings/connectors-settings";
import { ModelSettings } from "@/components/settings/model-settings";
import { NotificationsSettings } from "@/components/settings/notifications-settings";
import { Card, CardSurface, PageShell, SectionHeading } from "@/components/ui/boardui";

import { DashboardScreen } from "@/screens/dashboard";
import { AgentsScreen } from "@/screens/agents";
import { SkillsScreen, SkillsSkeleton } from "@/screens/skills";
import { ArtifactsScreen } from "@/screens/artifacts";
import { SupportScreen } from "@/screens/support";
import { RoadmapScreen } from "@/screens/roadmap";
import { UpdatesScreen } from "@/screens/updates";
import { SettingsHomeScreen } from "@/screens/settings-home";
import { SettingsRuntimeScreen } from "@/screens/settings-runtime";
import { SettingsRetentionScreen } from "@/screens/settings-retention";
import { SettingsSecurityScreen } from "@/screens/settings-security";
import { SettingsAchievementsScreen } from "@/screens/settings-achievements";
import { SetupScreen } from "@/screens/setup";
import { NotFoundScreen } from "@/screens/not-found";
import { SessionsScreen } from "@/screens/sessions";
import { AuditScreen } from "@/screens/audit";
import { GuidedTaskScreen } from "@/screens/guided-task";
import { GuidedTaskDetailScreen } from "@/screens/guided-task-detail";
import { DEFAULT_CONSOLE_PATH } from "@/components/shell/nav-config";
import { parseRuntimeSection } from "@/lib/runtime/settings-navigation";

import {
  loadAgent,
  loadAgents,
  loadArtifacts,
  loadAudit,
  loadHermesUpdates,
  loadDashboard,
  loadAchievements,
  loadRetention,
  loadRuntime,
  loadSkills,
  loadSupport,
  loadSessions,
} from "@/loaders";

export type ConsoleAccessStatus = {
  authenticated: boolean;
  setupRequired: boolean;
  consentRequired: boolean;
  user?: { email: string } | null;
  siteContext: AuthSiteContext | null;
};

export function requiresSetupRedirect(auth: ConsoleAccessStatus) {
  return (
    !auth.authenticated ||
    siteAccessBlock(auth.siteContext) !== null ||
    auth.setupRequired ||
    auth.consentRequired
  );
}

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

/** Documentation publique : consultable avant OAuth et hors de la coque Console. */
const installationGuideRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/docs/installation-utilisation",
  component: () => (
    <Suspense fallback={<InstallationGuideRouteFallback />}>
      <InstallationGuideScreen />
    </Suspense>
  ),
});

function InstallationGuideRouteFallback() {
  return (
    <div className="installation-guide__route-loading" role="status" aria-live="polite">
      <span className="installation-guide__spinner" aria-hidden="true" />
      <span>Chargement du guide…</span>
    </div>
  );
}

// ── Coque Console : rail, palette ⌘K, fil d'ariane ───────────────────────────
const consoleLayout = createRoute({
  getParentRoute: () => rootRoute,
  id: "console",
  beforeLoad: async () => {
    const response = await fetch("/api/auth", { cache: "no-store" });
    const auth = (await response.json()) as ConsoleAccessStatus;
    setPersonaCapabilities(auth.siteContext?.capabilities);
    setPersonaRole(auth.siteContext?.activeSite?.role ?? null);
    setSessionCacheScope(
      auth.user?.email,
      auth.siteContext?.activeSite?.id,
      auth.siteContext?.authorization?.mandateId,
    );
    if (requiresSetupRedirect(auth)) {
      throw redirect({ to: "/setup", replace: true });
    }
  },
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
    <ChatSurfaceSkeleton home={pathname === "/chat" ? <OpenClawChatHome /> : undefined} />
  ) : (
    <Pending />
  );
}

const homeRoute = createRoute({
  getParentRoute: () => consoleLayout,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: DEFAULT_CONSOLE_PATH as never, replace: true });
  },
});

const dashboardRoute = createRoute({
  getParentRoute: () => consoleLayout,
  path: "/overview",
  loader: loadDashboard,
  component: () => <DashboardScreen data={dashboardRoute.useLoaderData()} />,
  pendingComponent: Pending,
  errorComponent: ErrorBox,
});

const sessionsRoute = createRoute({
  getParentRoute: () => consoleLayout,
  path: "/sessions",
  validateSearch: (search: Record<string, unknown>) => ({
    source: search.source === "chat" || search.source === "mission" ? search.source : undefined,
    view: search.view === "list" || search.view === "kanban" ? search.view : undefined,
    filter: typeof search.filter === "string" ? search.filter.slice(0, 100) : undefined,
    q: typeof search.q === "string" ? search.q.slice(0, 200) : undefined,
    action: search.action === "update" ? "update" as const : undefined,
    operation: typeof search.operation === "string" ? search.operation.slice(0, 100) : undefined,
  }),
  loader: loadSessions,
  component: function SessionsRoute() {
    return (
      <SessionsScreen
        data={sessionsRoute.useLoaderData()}
        search={sessionsRoute.useSearch()}
      />
    );
  },
  pendingComponent: Pending,
  errorComponent: ErrorBox,
});

const auditRoute = createRoute({
  getParentRoute: () => consoleLayout,
  path: "/audit",
  validateSearch: (search: Record<string, unknown>) => ({
    decision: search.decision === "allowed" || search.decision === "denied" ? search.decision : undefined,
    resource: typeof search.resource === "string" ? search.resource.slice(0, 100) : undefined,
    q: typeof search.q === "string" ? search.q.slice(0, 200) : undefined,
  }),
  loader: loadAudit,
  component: function AuditRoute() {
    return <AuditScreen data={auditRoute.useLoaderData()} search={auditRoute.useSearch()} />;
  },
  pendingComponent: Pending,
  errorComponent: ErrorBox,
});

const guidedTaskRoute = createRoute({
  getParentRoute: () => consoleLayout,
  path: "/tasks/new",
  component: GuidedTaskScreen,
});

const guidedTaskDetailRoute = createRoute({
  getParentRoute: () => consoleLayout,
  path: "/tasks/$taskId",
  component: function GuidedTaskDetailRoute() {
    const { taskId } = guidedTaskDetailRoute.useParams();
    return <GuidedTaskDetailScreen taskId={taskId} />;
  },
});

// ── Sessions de mission ─────────────────────────────────────────────────────
const missionsRoute = createRoute({
  getParentRoute: () => consoleLayout,
  path: "/runs",
  validateSearch: (search: Record<string, unknown>) => ({
    view: search.view === "table" || search.view === "list" ? "list" : "kanban",
    filter: typeof search.filter === "string" ? search.filter.slice(0, 100) : undefined,
  }),
  beforeLoad: ({ search }) => {
    const params = new URLSearchParams({ source: "mission", view: search.view });
    if (search.filter) params.set("filter", search.filter);
    throw redirect({ to: `/sessions?${params.toString()}` as never, replace: true });
  },
});

const newMissionRoute = createRoute({
  getParentRoute: () => consoleLayout,
  path: "/runs/new",
  beforeLoad: () => {
    throw redirect({ to: "/tasks/new" as never, replace: true });
  },
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

const skillsRoute = createRoute({
  getParentRoute: () => consoleLayout,
  path: "/skills",
  loader: loadSkills,
  component: () => <SkillsScreen data={skillsRoute.useLoaderData()} />,
  pendingComponent: SkillsSkeleton,
  errorComponent: ErrorBox,
});

const newAgentRoute = createRoute({
  getParentRoute: () => consoleLayout,
  path: "/agents/new",
  component: () => (
    <PageShell className="mx-auto max-w-4xl">
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

const roadmapRoute = createRoute({
  getParentRoute: () => consoleLayout,
  path: "/roadmap",
  component: RoadmapScreen,
});

const updatesRoute = createRoute({
  getParentRoute: () => consoleLayout,
  path: "/updates",
  validateSearch: (search: Record<string, unknown>) => ({
    kind:
      search.kind === "features" ||
      search.kind === "improvements" ||
      search.kind === "suppressions"
        ? (search.kind as
            | "features"
            | "improvements"
            | "suppressions")
        : "all",
    q: typeof search.q === "string" ? search.q.slice(0, 200) : undefined,
  }),
  loader: loadHermesUpdates,
  component: () => (
    <UpdatesScreen data={updatesRoute.useLoaderData()} search={updatesRoute.useSearch()} />
  ),
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
  validateSearch: (search: Record<string, unknown>) => ({
    // Absent : l'onglet suit le transport déjà configuré. Présent : l'URL
    // force l'onglet (lien partagé, retour arrière), même avant le chargement.
    mode: search.mode === "direct" || search.mode === "ssh" ? search.mode : undefined,
    section: parseRuntimeSection(search.section),
  }),
  component: function SettingsRuntimeRoute() {
    return <SettingsRuntimeScreen search={settingsRuntimeRoute.useSearch()} />;
  },
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

const settingsAchievementsRoute = createRoute({
  getParentRoute: () => settingsLayout,
  path: "/settings/achievements",
  loader: loadAchievements,
  component: () => (
    <SettingsAchievementsScreen data={settingsAchievementsRoute.useLoaderData()} />
  ),
  pendingComponent: Pending,
  errorComponent: ErrorBox,
});

export const routeTree = rootRoute.addChildren([
  setupRoute,
  installationGuideRoute,
  consoleLayout.addChildren([
    homeRoute,
    dashboardRoute,
    sessionsRoute,
    auditRoute,
    guidedTaskRoute,
    guidedTaskDetailRoute,
    missionsRoute,
    newMissionRoute,
    missionDetailRoute,
    agentsRoute,
    skillsRoute,
    newAgentRoute,
    agentDetailRoute,
    artifactsRoute,
    supportRoute,
    roadmapRoute,
    chatLayout.addChildren([chatHomeRoute, chatNewRoute, chatSessionRoute]),
    ...legacyChatRoutes,
    legacyChatSessionRoute,
    legacyChatSessionSingularRoute,
    updatesRoute,
    settingsLayout.addChildren([
      settingsHomeRoute,
      settingsRuntimeRoute,
      settingsModelsRoute,
      settingsConnectorsRoute,
      settingsAppearanceRoute,
      settingsNotificationsRoute,
      settingsRetentionRoute,
      settingsSecurityRoute,
      settingsAchievementsRoute,
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
