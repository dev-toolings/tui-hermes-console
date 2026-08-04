"use client";

import { Link } from "@/lib/router";
import { useRouter } from "@/lib/router";
import { useState } from "react";
import {
  ArchiveIcon,
  MoreHorizontalIcon,
  RotateCcwIcon,
  Settings2Icon,
  Trash2Icon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@boardui/ui";

export function AgentCardActions({
  agentId,
  agentName,
  archived = false,
}: {
  agentId: string;
  agentName: string;
  archived?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function setArchived(archive: boolean) {
    setPending(true);
    try {
      const response = await fetch(`/api/agents/${agentId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Hermes-Toast": "updated",
        },
        body: JSON.stringify({ archive }),
      });
      if (response.ok) router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function deletePermanently() {
    setPending(true);
    try {
      const response = await fetch(`/api/agents/${agentId}`, {
        method: "DELETE",
        headers: { "X-Hermes-Toast": "deleted" },
      });
      if (response.ok) router.refresh();
    } finally {
      setPending(false);
    }
  }

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
        <>
          <DropdownMenuItem
            disabled={pending}
            onSelect={(event) => {
              event.preventDefault();
              void setArchived(!archived);
            }}
          >
            {archived ? <RotateCcwIcon /> : <ArchiveIcon />}
            {archived ? "Restaurer" : "Archiver"}
          </DropdownMenuItem>
          {archived ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={pending}
                onSelect={(event) => {
                  event.preventDefault();
                  if (
                    !window.confirm(
                      `Supprimer définitivement « ${agentName} » ?\n\nL’agent sera retiré de la base et les sessions Hermes liées seront effacées. Cette action est irréversible.`,
                    )
                  ) {
                    return;
                  }
                  void deletePermanently();
                }}
              >
                <Trash2Icon />
                Supprimer définitivement
              </DropdownMenuItem>
            </>
          ) : null}
        </>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
