import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { ChevronLeftIcon } from "lucide-react";
import type { MobileStack } from "./mobile-nav";

/**
 * Single header for the mobile stack. It owns the back affordance so no screen
 * ships its own: the channel view and its panels hide theirs under 1024px.
 */
export function MobileHeader({
  stack,
  actions,
}: {
  stack: MobileStack;
  actions?: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <header className="mobile-header lg:hidden">
      <div className="mobile-header__bar">
        {stack.parent ? (
          <button
            type="button"
            onClick={() => navigate(stack.parent!.to)}
            className="mobile-header__back"
          >
            <ChevronLeftIcon className="size-5 shrink-0" strokeWidth={2.25} />
            <span className="truncate">{stack.parent.label}</span>
          </button>
        ) : (
          <span aria-hidden className="mobile-header__spacer" />
        )}
        <h1 className="mobile-header__title">{stack.title}</h1>
        <div className="mobile-header__actions">{actions}</div>
      </div>
    </header>
  );
}

export function MobileHeaderAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="mobile-header__action"
    >
      {children}
    </button>
  );
}
