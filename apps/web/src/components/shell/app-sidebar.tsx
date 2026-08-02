"use client";

import type { ComponentProps } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@boardui/ui";
import { Link } from "@/lib/router";
import { NavDocuments } from "./nav-documents";
import { NavMain } from "./nav-main";
import { NavSecondary } from "./nav-secondary";
import { NavUser } from "./nav-user";
import { RuntimeStatusCard } from "./runtime-status-card";

export function AppSidebar({
  onOpenPalette,
  capabilities,
  ...props
}: ComponentProps<typeof Sidebar> & {
  onOpenPalette: () => void;
  capabilities: ReadonlySet<string>;
}) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:p-1.5!">
              <Link href="/">
                <img
                  src="/brand/hermes-console-favicon.png"
                  alt=""
                  width="24"
                  height="24"
                  className="size-6 shrink-0 rounded-md object-contain"
                />
                <span className="text-base font-semibold">Hermes Console</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <NavMain onOpenPalette={onOpenPalette} capabilities={capabilities} />
        <NavDocuments capabilities={capabilities} />
        <NavSecondary capabilities={capabilities} className="mt-auto" />
      </SidebarContent>

      <SidebarFooter>
        <RuntimeStatusCard />
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
