"use client";

import { Link } from "@/lib/router";
import { usePathname } from "@/lib/router";
import {
  BellIcon,
  BrainCircuitIcon,
  DatabaseIcon,
  LayoutGridIcon,
  MailIcon,
  PaletteIcon,
  ServerIcon,
  ShieldIcon,
  TrophyIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

const SECTIONS = [
  { href: "/settings", label: "Vue d’ensemble", icon: LayoutGridIcon, exact: true as const },
  { href: "/settings/appearance", label: "Apparence", icon: PaletteIcon, exact: false as const },
  { href: "/settings/runtime", label: "Runtime Hermes", icon: ServerIcon, exact: false as const },
  { href: "/settings/connectors", label: "Connecteurs", icon: MailIcon, exact: false as const },
  { href: "/settings/models", label: "Modèles", icon: BrainCircuitIcon, exact: false as const },
  { href: "/settings/notifications", label: "Notifications", icon: BellIcon, exact: false as const },
  { href: "/settings/retention", label: "Conservation", icon: DatabaseIcon, exact: false as const },
  { href: "/settings/security", label: "Sécurité", icon: ShieldIcon, exact: false as const },
  { href: "/settings/achievements", label: "Badges", icon: TrophyIcon, exact: false as const },
];

export function SettingsNav({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Sections des paramètres" className={cn("flex flex-col gap-1", className)}>
      <p className="mb-2 hidden px-2 text-[0.6875rem] font-medium tracking-wide text-muted-foreground uppercase lg:block">
        Paramètres
      </p>
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-subtle lg:flex-col lg:overflow-visible lg:pb-0">
        {SECTIONS.map((section) => {
          const active = section.exact
            ? pathname === section.href
            : pathname === section.href || pathname.startsWith(`${section.href}/`);
          const Icon = section.icon;
          return (
            <Link
              key={section.href}
              href={section.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-[10px] px-2.5 py-2 text-[0.8125rem] transition-colors",
                active
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="whitespace-nowrap">{section.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
