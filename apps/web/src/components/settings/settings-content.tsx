import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function SettingsContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("flex flex-col gap-4", className)}>{children}</div>;
}
