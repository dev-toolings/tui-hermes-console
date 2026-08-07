import type { ThreadListItemDto } from "@console/core/modules/runs/types";
import { useCallback, useEffect, useState } from "react";

import { ConsoleApiClient } from "@/lib/api-client";
import { loadConnection } from "@/lib/session-store";

type ThreadsState =
  | { status: "loading"; threads: ThreadListItemDto[]; message: null }
  | { status: "disconnected" | "error"; threads: ThreadListItemDto[]; message: string }
  | { status: "ready"; threads: ThreadListItemDto[]; message: null };

export function useConsoleThreads() {
  const [state, setState] = useState<ThreadsState>({ status: "loading", threads: [], message: null });
  const refresh = useCallback(async () => {
    setState((current) => ({ status: "loading", threads: current.threads, message: null }));
    try {
      const connection = await loadConnection();
      if (!connection) {
        setState({ status: "disconnected", threads: [], message: "Connectez votre Console pour retrouver vos missions." });
        return;
      }
      const { threads } = await new ConsoleApiClient(connection).listThreads();
      setState({ status: "ready", threads, message: null });
    } catch (error) {
      setState({ status: "error", threads: [], message: error instanceof Error ? error.message : "Les missions sont indisponibles." });
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return { ...state, refresh };
}
