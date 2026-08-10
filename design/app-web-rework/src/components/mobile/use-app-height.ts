import { useEffect } from "react";

/**
 * Keeps `--app-height` in sync with the visual viewport so the shell shrinks
 * when the virtual keyboard opens. `dvh` alone is not enough: iOS Safari never
 * resizes the layout viewport for the keyboard, it only shrinks the visual one.
 * While the user is pinch-zooming (scale !== 1) the variable is dropped so the
 * layout falls back to `100dvh` instead of fighting the zoom.
 */
export function useAppHeight() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    const update = () => {
      if (viewport.scale !== 1) {
        root.style.removeProperty("--app-height");
        return;
      }
      root.style.setProperty("--app-height", `${Math.round(viewport.height)}px`);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      root.style.removeProperty("--app-height");
    };
  }, []);
}
