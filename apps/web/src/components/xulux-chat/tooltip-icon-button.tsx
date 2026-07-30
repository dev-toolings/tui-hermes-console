"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type XuluxTooltipIconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tooltip?: string;
  side?: "top" | "right" | "bottom" | "left";
  variant?: string;
  size?: string;
  children?: ReactNode;
};

/** Copie exacte de v1-xulux/d/chat — pas de wrapper BoardUI/shadcn. */
export function XuluxTooltipIconButton({
  tooltip,
  className,
  children,
  side: _side,
  size: _size,
  variant: _variant,
  ...props
}: XuluxTooltipIconButtonProps) {
  return (
    <button
      type="button"
      aria-label={tooltip ?? props["aria-label"]}
      title={tooltip}
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-md p-1 text-current transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
