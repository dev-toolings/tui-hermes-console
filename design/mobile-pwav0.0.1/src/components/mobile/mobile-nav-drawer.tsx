import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { XIcon } from "lucide-react";
import {
  DEFAULT_DRAWER_WIDTH,
  clampDrawerProgress,
  drawerFocusable,
  getDrawerSwipeAxis,
  shouldOpenDrawer,
} from "./drawer";

type DrawerSwipe = {
  axis: "pending" | "horizontal" | "vertical";
  drawerWidth: number;
  pointerId: number;
  startX: number;
  startY: number;
  startTime: number;
};

/**
 * Shell navigation drawer for mobile. It replaces the bottom tab bar: the whole
 * workspace navigation now lives behind the header's menu button, so nothing is
 * pinned to the bottom of the viewport and the browser chrome keeps its space.
 *
 * The panel overlays the content rather than pushing it, which keeps the shell
 * layout untouched; the content is inert while it is open, so a screen reader
 * and the Tab key stay inside the drawer.
 */
export function MobileNavDrawer({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const swipeRef = useRef<DrawerSwipe | null>(null);
  const [dragging, setDragging] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Focus enters on the close button and returns to whatever opened the drawer,
  // so a keyboard user is never dropped back at the top of the document.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      opener?.focus();
    };
  }, [open]);

  // The drawer is not a page: a scroll behind it would strand the reader.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const setProgress = (progress: number) => {
    rootRef.current?.style.setProperty(
      "--mobile-drawer-progress",
      String(clampDrawerProgress(progress)),
    );
  };
  /**
   * Settling hands the progress back to the stylesheet: an inline value left
   * over from a drag would outrank `[data-open]` on the next opening.
   */
  const settle = (nextOpen: boolean) => {
    setDragging(false);
    rootRef.current?.style.removeProperty("--mobile-drawer-progress");
    if (!nextOpen) onClose();
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!open || event.pointerType === "mouse") return;
    swipeRef.current = {
      axis: "pending",
      drawerWidth:
        panelRef.current?.getBoundingClientRect().width || DEFAULT_DRAWER_WIDTH,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTime: event.timeStamp,
    };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const swipe = swipeRef.current;
    if (!swipe || swipe.pointerId !== event.pointerId || swipe.axis === "vertical")
      return;
    const distanceX = event.clientX - swipe.startX;
    const distanceY = event.clientY - swipe.startY;
    if (swipe.axis === "pending") {
      const axis = getDrawerSwipeAxis(distanceX, distanceY);
      if (axis === "pending") return;
      // Only a leftward drag closes it; a rightward one is over-drag.
      if (axis === "vertical" || distanceX > 0) {
        swipe.axis = "vertical";
        return;
      }
      swipe.axis = "horizontal";
      setDragging(true);
    }
    setProgress(1 + distanceX / swipe.drawerWidth);
  };
  const finishSwipe = (event: PointerEvent<HTMLDivElement>) => {
    const swipe = swipeRef.current;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    swipeRef.current = null;
    if (swipe.axis !== "horizontal") return;
    const distanceX = event.clientX - swipe.startX;
    const elapsed = Math.max(1, event.timeStamp - swipe.startTime);
    settle(
      shouldOpenDrawer(
        clampDrawerProgress(1 + distanceX / swipe.drawerWidth),
        distanceX / elapsed,
      ),
    );
  };
  const cancelSwipe = () => {
    if (!swipeRef.current) return;
    swipeRef.current = null;
    settle(true);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      settle(false);
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = drawerFocusable(panelRef.current);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      ref={rootRef}
      className="mobile-drawer lg:hidden"
      data-open={open || undefined}
      data-dragging={dragging || undefined}
      aria-hidden={!open}
      inert={!open ? true : undefined}
    >
      <button
        type="button"
        className="mobile-drawer__backdrop"
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => settle(false)}
      />
      <div
        ref={panelRef}
        className="mobile-drawer__panel"
        role="dialog"
        aria-modal={open ? "true" : undefined}
        aria-label={label}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishSwipe}
        onPointerCancel={cancelSwipe}
      >
        <div className="mobile-drawer__bar">
          <button
            ref={closeRef}
            type="button"
            className="mobile-drawer__close"
            aria-label="Fermer la navigation"
            onClick={() => settle(false)}
          >
            <XIcon aria-hidden="true" className="size-5" />
          </button>
        </div>
        <div className="mobile-drawer__body">{children}</div>
      </div>
    </div>
  );
}
