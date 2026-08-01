"use client";

import { FolderIcon, MoreHorizontalIcon, ShareIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@boardui/ui";
import { Link, usePathname } from "@/lib/router";
import { DOCUMENTS_NAV, activeNavHref, navForCapabilities } from "./nav-config";

/**
 * Groupe intermédiaire du rail, dans la disposition `nav-documents` du bloc :
 * un `SidebarGroupLabel`, des entrées avec action au survol, et le groupe
 * entier masqué en mode icône.
 */
export function NavDocuments({ capabilities }: { capabilities: ReadonlySet<string> }) {
  const { isMobile } = useSidebar();
  const pathname = usePathname();
  const navigation = navForCapabilities(DOCUMENTS_NAV, capabilities);
  const activeHref = activeNavHref(navigation, pathname);

  if (navigation.length === 0) return null;

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Documents</SidebarGroupLabel>
      <SidebarMenu>
        {navigation.map((item) => (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton asChild isActive={activeHref === item.href}>
              <Link href={item.href}>
                <item.icon />
                <span>{item.label}</span>
              </Link>
            </SidebarMenuButton>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuAction showOnHover className="rounded-sm data-open:bg-accent">
                  <MoreHorizontalIcon />
                  <span className="sr-only">Plus</span>
                </SidebarMenuAction>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-32 rounded-lg"
                side={isMobile ? "bottom" : "right"}
                align={isMobile ? "end" : "start"}
              >
                <DropdownMenuItem asChild>
                  <Link href={item.href}>
                    <FolderIcon />
                    <span>Ouvrir</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    void navigator.clipboard?.writeText(
                      new URL(item.href, window.location.origin).toString(),
                    )
                  }
                >
                  <ShareIcon />
                  <span>Copier le lien</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
