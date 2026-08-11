import { useEffect } from "react";

/**
 * Keeps `--app-height` in sync with the visual viewport so the shell shrinks
 * when the virtual keyboard opens. `dvh` alone is not enough: iOS Safari never
 * resizes the layout viewport for the keyboard, it only shrinks the visual one.
 * While the user is pinch-zooming (scale !== 1) the variable is dropped so the
 * layout falls back to `100dvh` instead of fighting the zoom.
 *
 * Installed on the iOS home screen, WebKit also shrinks the whole canvas the
 * first time the keyboard opens and never restores it, so every later frame is
 * measured against a viewport tens of pixels too short and a dead band opens
 * under the content for the rest of the session. Toggling `display` on the
 * shell once the keyboard is gone forces WebKit to re-measure, which is the
 * only known remedy. The deficit guard keeps all of it inert on the platforms
 * and versions that do not exhibit the shrink.
 */
const HEAL_DELAY_MS = 140;
const HEAL_DEFICIT_PX = 4;

export function useAppHeight() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    let tallest = window.innerHeight;
    let healTimer: number | null = null;

    const update = () => {
      if (viewport.scale !== 1) {
        root.style.removeProperty("--app-height");
        root.style.removeProperty("--app-offset");
        return;
      }
      root.style.setProperty("--app-height", `${Math.round(viewport.height)}px`);
      // iOS never shrinks the layout viewport for the keyboard, it scrolls the
      // page instead. Without this offset the shell keeps its top glued to the
      // document while the visual viewport has moved down, and the gap reopens
      // between the composer and the keyboard.
      root.style.setProperty(
        "--app-offset",
        `${Math.round(viewport.offsetTop)}px`,
      );
    };

    /** Only ever grows, so a keyboard-shrunk frame cannot poison the reference. */
    const trackTallest = () => {
      tallest = Math.max(tallest, window.innerHeight);
    };

    const heal = () => {
      healTimer = null;
      if (tallest - window.innerHeight <= HEAL_DEFICIT_PX) return;
      const shell = document.querySelector<HTMLElement>(".app-shell");
      if (!shell) return;
      const scroller = document.querySelector<HTMLElement>(
        "[data-mobile-tab-scroll]",
      );
      const scrollTop = scroller?.scrollTop ?? 0;
      // Restored in the same task, so React never observes the detached frame.
      shell.style.display = "none";
      void shell.offsetHeight;
      shell.style.removeProperty("display");
      if (scroller) scroller.scrollTop = scrollTop;
      update();
    };

    const scheduleHeal = () => {
      if (healTimer !== null) window.clearTimeout(healTimer);
      healTimer = window.setTimeout(heal, HEAL_DELAY_MS);
    };

    /**
     * A field that blurs and immediately takes the focus back, which is how the
     * composers raise the keyboard again after the native file picker, leaves
     * nothing to heal. Cancelling the pending pass spares that round trip a
     * shell reflow it does not need.
     */
    const cancelHeal = () => {
      if (healTimer === null) return;
      window.clearTimeout(healTimer);
      healTimer = null;
    };

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    window.addEventListener("resize", trackTallest);
    document.addEventListener("focusout", scheduleHeal);
    document.addEventListener("focusin", cancelHeal);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      window.removeEventListener("resize", trackTallest);
      document.removeEventListener("focusout", scheduleHeal);
      document.removeEventListener("focusin", cancelHeal);
      if (healTimer !== null) window.clearTimeout(healTimer);
      root.style.removeProperty("--app-height");
      root.style.removeProperty("--app-offset");
    };
  }, []);
}
