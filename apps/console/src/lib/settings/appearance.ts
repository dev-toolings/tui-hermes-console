import { createAppearance } from "@boardui/ui/shell";

export const hermesAppearance = createAppearance({
  storageKey: "hermes-console-appearance",
  defaults: {
    contentWidth: 1280,
    sidebarWidth: 260,
    uiScale: 100,
  },
});
