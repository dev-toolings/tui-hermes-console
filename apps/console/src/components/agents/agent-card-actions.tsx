"use client";

import { Link } from "@/lib/router";
import { useRouter } from "@/lib/router";
import { useTransition } from "react";
import { MoreHorizontalIcon, Settings2Icon, Trash2Icon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@boardui/ui";

export function AgentCardActions({
  agentId,
  agentName,
  protectedAgent = false,
}: {
  agentId: string;
  agentName: string;
  protectedAgent?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Actions pour ${agentName}`}
        disabled={pending}
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-50"
      >
        <MoreHorizontalIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuItem asChild>
          <Link href={`/agents/${agentId}`} className="flex items-center gap-2">
            <Settings2Icon />
            Configurer
          </Link>
        </DropdownMenuItem>
        {!protectedAgent ? (
          <DropdownMenuItem
            variant="destructive"
            disabled={pending}
            onSelect={(event) => {
              event.preventDefault();
              if (
                !window.confirm(
                  `Supprimer « ${agentName} » ?\n\nL’agent sera retiré de la base et les sessions Hermes liées seront effacées.`,
                )
              ) {
                return;
              }
              startTransition(async () => {
                await fetch(`/api/agents/${agentId}`, { method: "DELETE" });
                router.refresh();
              });
            }}
          >
            <Trash2Icon />
            Supprimer
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
