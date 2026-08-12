import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { RiCloseLine } from "@remixicon/react";

/**
 * Non-modal side peek: the board behind must stay interactive, so unlike
 * `Modal` there is no overlay, no focus trap and no body scroll lock. Focus is
 * parked on the panel while it is open and handed back on close; Esc closes.
 */
export function MissionSheet({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  // Switching missions keeps the sheet mounted and recreates `onClose` (its
  // search closure moves); the ref lets the mount-only effect see the latest.
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close.current();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  return createPortal(
    <div ref={panel} role="dialog" aria-label={label} tabIndex={-1} className="mission-sheet">
      <header className="mission-sheet__head">
        <span className="mission-sheet__eyebrow">Mission</span>
        <button
          type="button"
          aria-label="Fermer"
          onClick={onClose}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-[8px] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
        >
          <RiCloseLine className="size-4" />
        </button>
      </header>
      <div className="mission-sheet__body">{children}</div>
    </div>,
    document.body,
  );
}
