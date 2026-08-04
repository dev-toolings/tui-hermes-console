"use client";

import { CircleCheckIcon, CircleDashedIcon, CircleXIcon, DownloadIcon } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@boardui/ui";
import { Link, usePathname } from "@/lib/router";
import { useHermesUpdateSnapshot } from "@/components/updates/hermes-update-store";
import { Badge } from "@/components/ui/boardui";
import { FOOTER_NAV, activeNavHref, navForCapabilities } from "./nav-config";

export function NavFooter({ capabilities }: { capabilities: ReadonlySet<string> }) {
  const pathname = usePathname();
  const navigation = navForCapabilities(FOOTER_NAV, capabilities);
  const activeHref = activeNavHref(navigation, pathname);
  const updateSnapshot = useHermesUpdateSnapshot();
  const canReadUpdates = navigation.some((item) => item.href === "/updates");
  if (!navigation.length && !canReadUpdates) return null;

  const updateStatus = updateSnapshot.status === "checking"
    ? { label: "Vérification des mises à jour", Icon: CircleDashedIcon, iconClassName: "animate-spin motion-reduce:animate-none" }
    : updateSnapshot.status === "unavailable"
      ? { label: "État des mises à jour indisponible", Icon: CircleXIcon, iconClassName: "" }
      : updateSnapshot.operation && !["succeeded", "rolled_back", "failed"].includes(updateSnapshot.operation.status)
        ? {
            label: updateSnapshot.operation.status === "recovery_required"
              ? "Intervention requise"
              : `Mise à jour en cours · ${updateSnapshot.operation.progress} %`,
            Icon: updateSnapshot.operation.status === "recovery_required" ? CircleXIcon : CircleDashedIcon,
            iconClassName: updateSnapshot.operation.status === "recovery_required" ? "" : "animate-spin motion-reduce:animate-none",
          }
      : updateSnapshot.plan.available
        ? { label: "Mise à jour disponible", Icon: DownloadIcon, iconClassName: "text-primary" }
        : { label: "Hermes est à jour", Icon: CircleCheckIcon, iconClassName: "" };
  const updateHref = updateSnapshot.status === "ready" && updateSnapshot.operation
    ? `/updates?operation=${encodeURIComponent(updateSnapshot.operation.id)}`
    : updateSnapshot.status === "ready" && updateSnapshot.plan.available
      ? "/updates?action=update"
      : "/updates";
  const hermesIsUpToDate = updateSnapshot.status === "ready" && !updateSnapshot.plan.available;
  const section = navigation[0]?.section ?? "Administration";

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {section}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          {navigation.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                tooltip={item.label}
                isActive={activeHref === item.href}
                size="sm"
              >
                <Link href={item.href}>
                  <item.icon />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
          {canReadUpdates ? (
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip={updateStatus.label} isActive={false}>
                <Link href={updateHref} className="text-muted-foreground">
                  {hermesIsUpToDate ? (
                    <Badge tone="success">
                      <CircleCheckIcon className="size-3" aria-hidden="true" />
                      Hermes est à jour
                    </Badge>
                  ) : (
                    <>
                      <updateStatus.Icon className={updateStatus.iconClassName} aria-hidden="true" />
                      <span className="truncate text-xs">{updateStatus.label}</span>
                    </>
                  )}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
