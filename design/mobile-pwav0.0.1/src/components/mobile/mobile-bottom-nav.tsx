import {
  ActivityIcon,
  HouseIcon,
  SearchIcon,
  SparklesIcon,
  type LucideIcon,
} from "lucide-react";
import { NavLink } from "react-router";
import {
  MOBILE_TAB_ENTRIES,
  mobileTabForPath,
  orgPath,
  persistMobileTabScroll,
  stripOrg,
} from "./mobile-nav";

export type MobileBottomNavProps = {
  workspaceId: string;
  pendingItems?: number;
};

/**
 * Root-only navigation. Detail pages deliberately do not mount it, preserving
 * the stack back affordance and leaving chat composition unobstructed. On the
 * roots that do mount it the bar stays put while the user types: the shell
 * already tracks the visual viewport, so the keyboard opens under the bar
 * instead of behind it, and unmounting it only made the layout jump.
 */
export function MobileBottomNav({
  workspaceId,
  pendingItems = 0,
}: MobileBottomNavProps) {
  const entries: Array<{
    path: string;
    label: string;
    icon: LucideIcon;
    badge?: number;
  }> = [
    { ...MOBILE_TAB_ENTRIES[0], icon: HouseIcon, badge: pendingItems },
    { ...MOBILE_TAB_ENTRIES[1], icon: ActivityIcon },
    { ...MOBILE_TAB_ENTRIES[2], icon: SparklesIcon },
  ];

  const persistCurrentScroll = () => {
    const path = stripOrg(window.location.pathname);
    const scrollContainer = document.querySelector<HTMLElement>(
      "[data-mobile-tab-scroll]",
    );
    persistMobileTabScroll(
      workspaceId,
      mobileTabForPath(path),
      scrollContainer?.scrollTop ?? 0,
    );
  };

  return (
    <nav aria-label="Navigation principale" className="mobile-bottom-nav">
      {entries.map(({ path, label, icon: Icon, badge }) => (
        <NavLink
          key={path}
          to={orgPath(workspaceId, path)}
          end={path !== "/hermes"}
          onClick={persistCurrentScroll}
          className={({ isActive }) =>
            `mobile-bottom-nav__item ${isActive ? "is-active" : ""}`
          }
        >
          <span className="mobile-bottom-nav__icon">
            <Icon aria-hidden="true" size={19} strokeWidth={2} />
            {badge ? <span aria-hidden="true" className="mobile-bottom-nav__badge">{Math.min(99, badge)}</span> : null}
          </span>
          <span>{label}</span>
        </NavLink>
      ))}
      <button
        type="button"
        className="mobile-bottom-nav__item"
        onClick={() => {
          persistCurrentScroll();
          window.dispatchEvent(new Event("hermes:open-search"));
        }}
      >
        <span className="mobile-bottom-nav__icon">
          <SearchIcon aria-hidden="true" size={19} strokeWidth={2} />
        </span>
        <span>{MOBILE_TAB_ENTRIES[3].label}</span>
      </button>
    </nav>
  );
}
