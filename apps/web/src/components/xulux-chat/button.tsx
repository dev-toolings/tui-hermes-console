"use client";

import type * as React from "react";
import { cn } from "@/lib/utils";

type XuluxButtonProps = React.ComponentProps<"button"> & {
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "icon";
};

export function XuluxButton({
  className,
  variant = "default",
  size = "default",
  ...props
}: XuluxButtonProps) {
  return (
    <button
      data-slot="button"
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        variant === "default" && "bg-primary text-primary-foreground hover:bg-primary/90",
        variant === "outline" &&
          "border border-border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
        variant === "ghost" && "hover:bg-accent hover:text-accent-foreground",
        size === "default" && "h-9 px-4 py-2 has-[>svg]:px-3",
        size === "sm" && "h-8 gap-1.5 px-3 text-xs has-[>svg]:px-2.5",
        size === "icon" && "size-9",
        className,
      )}
      {...props}
    />
  );
}
