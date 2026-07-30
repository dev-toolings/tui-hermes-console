"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DELTA_FLUSH_MS,
  HermesEventNormalizer,
  type RunEvent,
  type TokenUsage,
} from "@console/core/lib/hermes-events";
import { FIXTURE_RUN, replayFixtures, type ReplaySpeed } from "@/lib/fixture-replay";
import type { RunStatus } from "@console/core/lib/run-status";

export type ApprovalRequest = {
  command: string | null;
  choices: string[];
  description: string | null;
};

export type RunState = {
  status: RunStatus;
  events: RunEvent[];
  output: string | null;
  usage: TokenUsage | null;
  approval: ApprovalRequest | null;
  error: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
};

const INITIAL: RunState = {
  status: "pending",
  events: [],
  output: null,
  usage: null,
  approval: null,
  error: null,
  startedAt: null,
  endedAt: null,
};

/**
 * Pilote l'ecran de mission a partir du rejeu des fixtures du spike.
 *
 * En Phase 1, seule la source change (SSE `/api/runs/:id/events` + replay
 * Postgres) : le normaliseur, le coalescing et la machine a etats restent
 * identiques. C'est la raison d'etre de cette separation.
 */
export function useRunReplay({ speed = "fast" }: { speed?: ReplaySpeed } = {}) {
  const [state, setState] = useState<RunState>(INITIAL);
  const [nonce, setNonce] = useState(0);
  const normalizerRef = useRef<HermesEventNormalizer | null>(null);

  const restart = useCallback(() => {
    setState(INITIAL);
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const normalizer = new HermesEventNormalizer();
    normalizerRef.current = normalizer;

    // Tampon local : on ne re-rend pas a chaque delta (33,6/s mesures),
    // on agrege puis on pousse toutes les DELTA_FLUSH_MS.
    let pending: RunEvent[] = [];
    const commit = () => {
      const flushed = [...pending, ...normalizer.flush()];
      pending = [];
      if (flushed.length === 0) return;
      setState((prev) => applyEvents(prev, flushed));
    };
    const timer = setInterval(commit, DELTA_FLUSH_MS);

    (async () => {
      setState((prev) => ({ ...prev, status: "running", startedAt: new Date() }));
      try {
        for await (const raw of replayFixtures(undefined, { speed, signal: controller.signal })) {
          pending.push(...normalizer.push(raw));
        }
        if (controller.signal.aborted) return;
        commit();
        setState((prev) => ({
          ...prev,
          status: prev.status === "awaiting_approval" ? prev.status : "completed",
          endedAt: new Date(),
        }));
      } catch (e) {
        if (controller.signal.aborted) return;
        setState((prev) => ({
          ...prev,
          status: "failed",
          error: e instanceof Error ? e.message : String(e),
          endedAt: new Date(),
        }));
      }
    })();

    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [speed, nonce]);

  const respondApproval = useCallback((approved: boolean) => {
    setState((prev) => ({
      ...prev,
      approval: null,
      status: approved ? "running" : "cancelled",
      endedAt: approved ? null : new Date(),
    }));
  }, []);

  return { state, restart, respondApproval, run: FIXTURE_RUN };
}

function applyEvents(prev: RunState, incoming: RunEvent[]): RunState {
  let next: RunState = { ...prev, events: [...prev.events, ...incoming] };

  for (const ev of incoming) {
    switch (ev.type) {
      case "approval.requested":
        next = {
          ...next,
          status: "awaiting_approval",
          approval: {
            command: (ev.payload.command as string) ?? null,
            choices: (ev.payload.choices as string[]) ?? [],
            description: (ev.payload.description as string) ?? null,
          },
        };
        break;
      case "run.completed":
        next = {
          ...next,
          status: "completed",
          output: (ev.payload.output as string) ?? null,
          usage: (ev.payload.usage as TokenUsage) ?? null,
          endedAt: ev.occurredAt,
        };
        break;
      case "run.error":
        next = {
          ...next,
          status: "failed",
          error: (ev.payload.message as string) ?? "Erreur inconnue",
          endedAt: ev.occurredAt,
        };
        break;
    }
  }
  return next;
}
