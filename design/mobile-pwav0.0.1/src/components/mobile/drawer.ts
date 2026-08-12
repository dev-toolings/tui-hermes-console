/**
 * Shared gesture maths for the left drawers (assistant sessions, shell
 * navigation). The rules live here, not in a component, so both surfaces settle
 * a swipe identically and the maths stays unit-testable.
 */

export const DRAWER_EDGE_SIZE = 28;
export const DRAWER_LOCK_DISTANCE = 8;
export const DRAWER_VELOCITY = 0.5;
export const DEFAULT_DRAWER_WIDTH = 320;

export function shouldRestoreDrawerTriggerFocus(wasOpen: boolean, drawerOpen: boolean) {
  return wasOpen && !drawerOpen;
}

export function clampDrawerProgress(progress: number) {
  return Math.min(1, Math.max(0, progress));
}

export function shouldOpenDrawer(progress: number, velocity: number) {
  if (velocity >= DRAWER_VELOCITY) return true;
  if (velocity <= -DRAWER_VELOCITY) return false;
  return progress >= 0.5;
}

/**
 * A swipe only takes the drawer over once it has travelled far enough to prove
 * its intent, otherwise a vertical scroll would drag the panel with it.
 */
export function getDrawerSwipeAxis(distanceX: number, distanceY: number) {
  if (Math.max(Math.abs(distanceX), Math.abs(distanceY)) < DRAWER_LOCK_DISTANCE) {
    return "pending" as const;
  }
  return Math.abs(distanceY) >= Math.abs(distanceX)
    ? ("vertical" as const)
    : ("horizontal" as const);
}

/** Focusable descendants, in DOM order, excluding anything not rendered. */
export function drawerFocusable(panel: HTMLElement | null) {
  return Array.from(
    panel?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? [],
  ).filter((element) => element.getClientRects().length > 0);
}
