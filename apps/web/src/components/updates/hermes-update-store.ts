"use client";

import { useSyncExternalStore } from "react";
import type {
  HermesRuntimeUpdateOperationDto,
  HermesRuntimeUpdatePlanDto,
} from "@console/core/types/api";

type HermesUpdateSnapshot =
  | { status: "checking"; plan: null; operation: null }
  | { status: "ready"; plan: HermesRuntimeUpdatePlanDto; operation: HermesRuntimeUpdateOperationDto | null }
  | { status: "unavailable"; plan: null; operation: null };

const listeners = new Set<() => void>();
const initialSnapshot: HermesUpdateSnapshot = { status: "checking", plan: null, operation: null };
let snapshot: HermesUpdateSnapshot = initialSnapshot;

function emit(nextSnapshot: HermesUpdateSnapshot) {
  snapshot = nextSnapshot;
  for (const listener of listeners) listener();
}

export function publishHermesUpdateState(
  plan: HermesRuntimeUpdatePlanDto,
  operation: HermesRuntimeUpdateOperationDto | null,
) {
  emit({ status: "ready", plan, operation });
}

export function publishHermesUpdateUnavailable() {
  if (snapshot.status === "checking") emit({ status: "unavailable", plan: null, operation: null });
}

export function useHermesUpdateSnapshot() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
    () => initialSnapshot,
  );
}
