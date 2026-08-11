import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { RiCloseLine } from "@remixicon/react";

export function ModalButton({
  children,
  onClick,
  variant = "secondary",
  type = "button",
  disabled = false,
  form,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "secondary" | "primary" | "danger";
  type?: "button" | "submit";
  disabled?: boolean;
  form?: string;
}) {
  const variants = {
    secondary:
      "border border-[var(--border-control)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--surface-hover)]",
    primary:
      "bg-[var(--primary)] text-[var(--accent-contrast)] hover:bg-[var(--accent-500)]",
    danger:
      "bg-[var(--state-neg-fg)] text-white hover:opacity-90",
  } as const;
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      form={form}
      className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[8px] px-3 text-body-2-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 md:min-h-8 ${variants[variant]}`}
    >
      {children}
    </button>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => element.tabIndex >= 0);
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!panel.current?.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 md:items-center md:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`sheet-panel flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-[var(--border-card)] bg-[var(--card)] text-[var(--foreground)] shadow-[var(--shadow-elevated)] outline-none focus:outline-none md:max-h-[85dvh] md:rounded-2xl ${maxWidth}`}
      >
        <span aria-hidden className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-[var(--border-control)] md:hidden" />
        <div className="flex shrink-0 items-start justify-between gap-4 px-4 pt-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[14px] font-semibold tracking-[-0.01em]">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-body-regular text-[var(--muted-foreground)]">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-[8px] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] md:size-7"
          >
            <RiCloseLine className="size-5 md:size-4" />
          </button>
        </div>
        {children && <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-3">{children}</div>}
        {footer && (
          <div className="flex shrink-0 flex-col-reverse gap-2 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end md:pb-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
