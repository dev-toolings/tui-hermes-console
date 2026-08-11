import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate, useLocation } from "react-router";
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
  RegistryPage,
  SettingsPage,
  TaskPage,
  WorkspacesPage,
  ChannelPage,
} from "./App";
import { MissionPage, MissionsPage } from "./components/mission/mission-page";
import { LayoutLabPage } from "./components/mission/layout-lab";

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

function HomeRedirect() {
  const location = useLocation();
  return (
    <Navigate to={{ pathname: "/channels", search: location.search }} replace />
  );
}

// Deliberately created outside the React tree so browser history remains the route authority.
export const router = createBrowserRouter([
  {
    path: "/",
    Component: App,
    children: [
      { index: true, Component: HomeRedirect },
      { path: "menu", Component: MenuPage },
      { path: "activity", Component: ActivityPage },
      { path: "inbox", Component: InboxPage },
      { path: "inbox/:itemId", Component: InboxDetailPage },
      { path: "tasks/new", Component: TaskPage },
      { path: "missions", Component: MissionsPage },
      { path: "missions/:missionId", Component: MissionPage },
      { path: "layouts", Component: LayoutLabPage },
      { path: "history", Component: HistoryPage },
      { path: "members", Component: MembersPage },
      { path: "registry", Component: RegistryPage },
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
]);
