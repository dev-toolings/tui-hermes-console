import { create } from "zustand";
import type { StoredProductEvent } from "@/modules/runs/types";

export type HermesRunPhase = "idle" | "working" | "answering";

export type HermesToolActivity = {
  id: string;
  name: string;
  target: string;
  status: "running" | "ok" | "failed";
  durationMs: number | null;
  hasResultPayload: boolean | null;
  output?: unknown;
};

type HermesRunStore = {
  phase: HermesRunPhase;
  tools: HermesToolActivity[];
  start: () => void;
  startTool: (id: string, name: string, target: string) => void;
  settleTool: (
    id: string,
    ok: boolean,
    durationMs: number | null,
    hasResultPayload: boolean | null,
    output?: unknown,
  ) => void;
  answering: () => void;
  reset: () => void;
};

const idle = {
  phase: "idle" as HermesRunPhase,
  tools: [] as HermesToolActivity[],
};

export const useHermesRun = create<HermesRunStore>((set) => ({
  ...idle,
  start: () => set({ ...idle, phase: "working" }),
  startTool: (id, name, target) =>
    set((state) => ({
      tools: [
        ...state.tools,
        {
          id,
          name,
          target,
          status: "running",
          durationMs: null,
          hasResultPayload: null,
        },
      ],
      phase: state.phase === "answering" ? "working" : state.phase === "idle" ? "working" : state.phase,
    })),
  settleTool: (id, ok, durationMs, hasResultPayload, output) =>
    set((state) => ({
      tools: state.tools.map((tool) =>
        tool.id === id
          ? {
              ...tool,
              status: ok ? "ok" : "failed",
              durationMs,
              hasResultPayload,
              output,
            }
          : tool,
      ),
    })),
  answering: () => set((state) => (state.phase === "idle" ? state : { phase: "answering" })),
  reset: () => set(idle),
}));

export function applyProductEventToHermesRun(event: StoredProductEvent) {
  const store = useHermesRun.getState();

  switch (event.type) {
    case "tool.call":
      store.startTool(
        String(event.payload.toolCallId ?? crypto.randomUUID()),
        String(event.payload.tool ?? "outil"),
        String(event.payload.preview ?? event.payload.tool ?? "outil"),
      );
      return;
    case "tool.result":
      store.settleTool(
        String(event.payload.toolCallId ?? ""),
        event.payload.error !== true,
        typeof event.payload.durationMs === "number"
          ? event.payload.durationMs
          : null,
        typeof event.payload.hasResultPayload === "boolean"
          ? event.payload.hasResultPayload
          : null,
        event.payload.result,
      );
      return;
    case "agent.message": {
      const text = String(event.payload.text ?? "");
      if (text.trim()) store.answering();
      return;
    }
    case "run.completed":
      // Le snapshot terminal conserve le contenu live jusqu'à ce que le
      // message durable soit disponible. Le reset est fait après ce refresh.
      return;
    case "run.error":
      store.reset();
      return;
    case "system.notice":
      if (event.payload.kind === "cancelled") store.reset();
      return;
    default:
      return;
  }
}

export function hydrateHermesRunFromEvents(events: StoredProductEvent[]) {
  useHermesRun.getState().reset();
  if (events.length === 0) return;

  useHermesRun.getState().start();
  for (const event of events) {
    applyProductEventToHermesRun(event);
  }
}
