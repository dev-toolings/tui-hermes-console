import { createRootRoute, createRoute, Link, Outlet } from "@tanstack/react-router";
import { ActivityIcon, BotIcon, LayoutDashboardIcon, ServerIcon } from "lucide-react";
import { OverviewScreen } from "./screens/overview";
import { fetchOverview } from "./api";

/**
 * Coque du SPA.
 *
 * Les `page.tsx` server components de Next deviennent des routes avec
 * `loader` : le chargement des données quitte le serveur pour le client, mais
 * les écrans et le design system restent les mêmes.
 */
const rootRoute = createRootRoute({
  component: () => (
    <div className="flex h-dvh min-h-0 w-full overflow-hidden bg-background text-foreground">
      <aside className="hidden w-[15rem] shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 md:flex">
        <div className="flex h-[68px] items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-[10px] bg-[image:var(--gradient-primary)] text-sm font-bold text-primary-foreground">
            H
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">Hermes Console</span>
            <span className="block truncate text-[0.6875rem] text-muted-foreground">
              Desktop
            </span>
          </span>
        </div>
        <nav className="flex flex-col gap-1">
          <NavLink to="/" icon={LayoutDashboardIcon} label="Aperçu" />
          <NavLink to="/missions" icon={ActivityIcon} label="Missions" />
          <NavLink to="/agents" icon={BotIcon} label="Agents" />
          <NavLink to="/runtime" icon={ServerIcon} label="Runtime" />
        </nav>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto scrollbar-subtle">
        <Outlet />
      </main>
    </div>
  ),
});

function NavLink({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: typeof BotIcon;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex min-h-9 items-center gap-2.5 rounded-[10px] px-2.5 text-[0.8125rem] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      activeProps={{ className: "bg-muted font-medium text-foreground" }}
    >
      <Icon className="size-4 shrink-0" />
      {label}
    </Link>
  );
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  loader: fetchOverview,
  component: OverviewScreen,
  pendingComponent: () => (
    <p className="p-6 text-sm text-muted-foreground">Chargement…</p>
  ),
  errorComponent: ({ error }) => (
    <p role="alert" className="p-6 text-sm text-destructive">
      {error instanceof Error ? error.message : "Erreur de chargement."}
    </p>
  ),
});

/** Écrans encore à porter — annoncés comme tels plutôt que laissés en 404. */
function Pending({ title }: { title: string }) {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Écran pas encore porté depuis Next. L’API correspondante est déjà servie par
        <code className="mx-1 rounded bg-muted px-1 py-0.5 font-mono text-xs">apps/server</code>.
      </p>
    </div>
  );
}

const missionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/missions",
  component: () => <Pending title="Missions" />,
});

const agentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/agents",
  component: () => <Pending title="Agents" />,
});

const runtimeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/runtime",
  component: () => <Pending title="Runtime Hermes" />,
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  missionsRoute,
  agentsRoute,
  runtimeRoute,
]);
