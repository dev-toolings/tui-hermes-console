import { createBrowserRouter, Navigate, useLocation } from "react-router";
import App, {
  AccountPage,
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

function InboxRedirect() {
  const location = useLocation();
  return (
    <Navigate to={{ pathname: "/inbox", search: location.search }} replace />
  );
}

// Deliberately created outside the React tree so browser history remains the route authority.
export const router = createBrowserRouter([
  {
    path: "/",
    Component: App,
    children: [
      { index: true, Component: InboxRedirect },
      { path: "menu", Component: MenuPage },
      { path: "inbox", Component: InboxPage },
      { path: "inbox/:itemId", Component: InboxDetailPage },
      { path: "tasks/new", Component: TaskPage },
      { path: "history", Component: HistoryPage },
      { path: "members", Component: MembersPage },
      { path: "registry", Component: RegistryPage },
      { path: "audit", Component: AuditPage },
      { path: "settings", Component: SettingsPage },
      { path: "account", Component: AccountPage },
      { path: "workspaces", Component: WorkspacesPage },
      { path: "channels", Component: ChannelsPage },
      { path: "channels/:channelId", Component: ChannelPage },
      { path: "*", Component: NotFound },
    ],
  },
]);
