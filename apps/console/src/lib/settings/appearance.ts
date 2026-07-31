import { createAppearance } from "@boardui/ui/shell/appearance";

export const hermesAppearance = createAppearance({
  storageKey: "hermes-console-appearance",
  defaults: {
    contentWidth: 1280,
    // 288px = `calc(var(--spacing) * 72)`, la largeur que le bloc
    // `dashboard-01` pose sur son `SidebarProvider`.
    sidebarWidth: 288,
    uiScale: 100,
  },
});
