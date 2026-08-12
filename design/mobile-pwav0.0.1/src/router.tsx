import { lazy, Suspense } from "react";
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  useLocation,
} from "react-router";
import App, {
  AccountPage,
  ActivityPage,
  AuditPage,
  ChannelsPage,
  HistoryPage,
  InboxDetailPage,
  InboxPage,
  MembersPage,
  MenuPage,
  NotFound,
  SettingsPage,
  TaskPage,
  WorkspacesPage,
  ChannelPage,
} from "./App";
import { MissionPage, MissionsPage } from "./components/mission/mission-page";
import { LayoutLabPage } from "./components/mission/layout-lab";
import { LabsPage } from "./components/labs/labs-page";
import { TrainingPage } from "./components/labs/training-page";
import { LoginPage } from "./components/auth/login-page";
import { OnboardingPage } from "./components/auth/onboarding-page";
import { orgPath } from "./components/mobile/mobile-nav";
import { hasOnboarded, useAuthStore } from "./state/auth-store";
import { loadConsoleState } from "./state/console-store";

const AssistantPage = lazy(() =>
  import("./components/assistant/assistant-page").then(({ AssistantPage: Page }) => ({
    default: Page,
  })),
);

function AssistantRoute() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[48dvh] items-center justify-center text-sm text-[var(--muted-foreground)]">
          Chargement d’Hermes…
        </div>
      }
    >
      <AssistantPage />
    </Suspense>
  );
}

/**
 * Session guard for everything below it — the react-router equivalent of a
 * tanshipfast `beforeLoad`. The requested location survives the round-trip
 * through /login as a sanitized `redirect` parameter.
 */
function AuthGate() {
  const user = useAuthStore((state) => state.user);
  const location = useLocation();
  if (!user) {
    const target = `${location.pathname}${location.search}`;
    const search = target !== "/" ? `?redirect=${encodeURIComponent(target)}` : "";
    return <Navigate to={`/login${search}`} replace />;
  }
  return <Outlet />;
}

/** The authenticated entry point: onboarding first, then the active org. */
function HomeRedirect() {
  const onboarded = useAuthStore(hasOnboarded);
  if (!onboarded) return <Navigate to="/onboarding" replace />;
  return (
    <Navigate
      to={orgPath(loadConsoleState().activeWorkspaceId, "/inbox")}
      replace
    />
  );
}

// Deliberately created outside the React tree so browser history remains the route authority.
export const router = createBrowserRouter([
  { path: "/login", Component: LoginPage },
  {
    Component: AuthGate,
    children: [
      { index: true, Component: HomeRedirect },
      { path: "onboarding", Component: OnboardingPage },
      {
        path: ":org",
        Component: App,
        children: [
          { index: true, Component: () => <Navigate to="inbox" replace /> },
          { path: "menu", Component: MenuPage },
          { path: "activity", Component: ActivityPage },
          { path: "inbox", Component: InboxPage },
          { path: "inbox/:itemId", Component: InboxDetailPage },
          { path: "tasks/new", Component: TaskPage },
          { path: "missions", Component: MissionsPage },
          { path: "missions/:missionId", Component: MissionPage },
          { path: "labs", Component: LabsPage },
          { path: "labs/training", Component: TrainingPage },
          { path: "labs/layout-lab", Component: LayoutLabPage },
          // Legacy path from the layout-lab era; bookmarks keep working.
          { path: "layouts", Component: () => <Navigate to="../labs" replace /> },
          { path: "history", Component: HistoryPage },
          { path: "members", Component: MembersPage },
          { path: "audit", Component: AuditPage },
          { path: "settings", Component: SettingsPage },
          { path: "account", Component: AccountPage },
          { path: "workspaces", Component: WorkspacesPage },
          { path: "channels", Component: ChannelsPage },
          { path: "channels/:channelId", Component: ChannelPage },
          { path: "hermes", Component: AssistantRoute },
          { path: "hermes/:sessionId", Component: AssistantRoute },
          { path: "*", Component: NotFound },
        ],
      },
    ],
  },
]);
