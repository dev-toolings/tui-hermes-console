"use client";

import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { useEffect, useState, type FC } from "react";
import { cn } from "@/lib/utils";
import { RUN_STATUS, type RunStatus } from "@/lib/run-status";

type ThreadRow = {
  id: string;
  title: string;
  latestRun: { status: RunStatus } | null;
};

function useRunThreads() {
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let disposed = false;
    void fetch("/api/threads", { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { threads: ThreadRow[] }) => {
        if (!disposed) setThreads(body.threads ?? []);
      })
      .catch(() => {
        if (!disposed) setThreads([]);
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, []);

  return { threads, loading };
}

const ThreadListItems: FC<{ activeId: string; threads: ThreadRow[]; loading: boolean }> = ({
  activeId,
  threads,
  loading,
}) => {
  if (loading) {
    return (
      <div className="flex flex-col gap-0.5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex h-8 items-center px-2.5">
            <div className="h-3.5 w-full animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-0.5">
      {threads.map((thread) => {
        const active = thread.id === activeId;
        const status = thread.latestRun?.status ?? "pending";
        const style = RUN_STATUS[status];
        return (
          <li key={thread.id}>
            <Link
              href={`/chat/sessions/${thread.id}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "aui-thread-list-item group hover:bg-muted focus-visible:bg-muted data-active:bg-muted relative flex h-8 items-center rounded-md px-2.5 text-sm transition-colors focus-visible:outline-none",
                active && "bg-muted font-medium",
              )}
            >
              <span
                aria-hidden
                className={cn("mr-2 size-1.5 shrink-0 rounded-full", style.dot)}
              />
              <span className="aui-thread-list-item-title min-w-0 flex-1 truncate">
                {thread.title}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
};

export const XuluxChatSidebar: FC<{ activeId: string; collapsed?: boolean }> = ({
  activeId,
  collapsed = false,
}) => {
  const { threads, loading } = useRunThreads();

  return (
    <aside
      className={cn(
        "flex h-full flex-col overflow-hidden transition-all duration-200",
        collapsed ? "w-12" : "w-[16.25rem]",
      )}
    >
      <div
        className={cn(
          "mt-2 flex h-12 shrink-0 items-center transition-[padding] duration-200",
          collapsed ? "px-3.5" : "px-6",
        )}
      >
        <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-primary text-[0.625rem] font-bold text-primary-foreground">
          H
        </span>
        <span
          className={cn(
            "text-foreground/90 ml-2 text-sm font-medium whitespace-nowrap transition-opacity duration-200",
            collapsed && "opacity-0",
          )}
        >
          Hermes
        </span>
      </div>
      {collapsed ? (
        <Link
          href="/chat/sessions/new"
          title="Nouvelle conversation"
          className="mt-1 ml-2 flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <PlusIcon className="size-4" />
        </Link>
      ) : (
        <div className="flex w-[16.25rem] min-h-0 flex-1 flex-col overflow-hidden">
          <div className="px-3 pb-1">
            <Link
              href="/chat/sessions/new"
              className="aui-thread-list-new hover:bg-muted data-active:bg-muted flex h-8 items-center gap-2 rounded-md px-2.5 text-sm font-normal"
            >
              <PlusIcon className="size-4" />
              Nouvelle conversation
            </Link>
          </div>
          <div className="relative min-h-0 flex-1 overflow-y-auto p-3 scrollbar-subtle">
            <ThreadListItems activeId={activeId} threads={threads} loading={loading} />
          </div>
        </div>
      )}
    </aside>
  );
};

/** Sheet mobile — copie MobileSidebar de base.tsx */
export const XuluxMobileSidebar: FC<{ activeId: string; onClose?: () => void }> = ({
  activeId,
  onClose,
}) => {
  const { threads, loading } = useRunThreads();
  return (
    <div className="flex h-full w-[17.5rem] flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center px-4">
        <span className="text-sm font-medium">Conversations</span>
      </div>
      <div className="relative min-h-0 flex-1 overflow-y-auto p-3">
        <Link
          href="/chat/sessions/new"
          onClick={onClose}
          className="hover:bg-muted mb-2 flex h-8 items-center gap-2 rounded-md px-2.5 text-sm"
        >
          <PlusIcon className="size-4" />
          Nouvelle mission
        </Link>
        <ThreadListItems activeId={activeId} threads={threads} loading={loading} />
      </div>
    </div>
  );
};
