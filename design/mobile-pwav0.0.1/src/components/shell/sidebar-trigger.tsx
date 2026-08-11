import { PanelLeftIcon } from "lucide-react";

/**
 * Sidebar control, moved out of the sidebar and into the site header.
 * Geometry taken from shadcn `dashboard-01`: 28px square, 8px radius, -4px
 * optical pull so the icon aligns with the header padding. Touch keeps a 44px
 * target up to the laptop breakpoint, where the pointer is a mouse.
 */
export function SidebarTrigger({
  collapsed,
  onToggle,
  className = "",
}: {
  collapsed: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={collapsed ? "Ouvrir la sidebar" : "Fermer la sidebar"}
      aria-expanded={!collapsed}
      title={collapsed ? "Ouvrir la sidebar" : "Fermer la sidebar"}
      className={`-ml-1 hidden size-7 shrink-0 items-center justify-center rounded-[8px] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] lg:inline-flex ${className}`}
    >
      <PanelLeftIcon className="size-4" />
    </button>
  );
}
