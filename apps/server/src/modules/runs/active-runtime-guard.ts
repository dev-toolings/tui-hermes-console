import { HermesRuntimeError } from "@/modules/runtime/hermes-adapter";

export type RuntimeMutationLease = { readonly id: symbol };

type RuntimeExclusionState = {
  mutationLease: RuntimeMutationLease | null;
  runReservations: number;
};

type RuntimeGlobals = typeof globalThis & {
  hermesConsoleActiveRuns?: Map<string, unknown>;
  hermesConsoleRuntimeExclusion?: RuntimeExclusionState;
};

const globals = globalThis as RuntimeGlobals;
const exclusion = (globals.hermesConsoleRuntimeExclusion ??= {
  mutationLease: null,
  runReservations: 0,
});

export function activeRuntimeRunCount() {
  return globals.hermesConsoleActiveRuns?.size ?? 0;
}

/** Acquisition exclusive synchrone : atomique dans la boucle JS. */
export function acquireRuntimeMutationLease(): {
  lease: RuntimeMutationLease;
  release: () => void;
} {
  if (
    exclusion.mutationLease ||
    exclusion.runReservations > 0 ||
    activeRuntimeRunCount() > 0
  ) {
    throw new HermesRuntimeError(
      "Une mission est en cours ou en préparation. Attendez sa fin avant de modifier le runtime Hermes.",
      409,
      "RUNTIME_MUTATION_ACTIVE_RUNS",
    );
  }
  const lease = { id: Symbol("runtime-mutation") };
  exclusion.mutationLease = lease;
  let released = false;
  return {
    lease,
    release() {
      if (released) return;
      released = true;
      if (exclusion.mutationLease === lease) exclusion.mutationLease = null;
    },
  };
}

export async function withRuntimeMutationLease<T>(
  operation: (lease: RuntimeMutationLease) => Promise<T>,
  existing?: RuntimeMutationLease,
) {
  if (existing) {
    if (exclusion.mutationLease !== existing) {
      throw new Error("lease de mutation runtime invalide");
    }
    return operation(existing);
  }
  const acquired = acquireRuntimeMutationLease();
  try {
    return await operation(acquired.lease);
  } finally {
    acquired.release();
  }
}

/** Réserve le droit de persister puis démarrer un run face aux mutations longues. */
export function acquireRunStartLease() {
  if (exclusion.mutationLease) {
    throw new HermesRuntimeError(
      "Le runtime Hermes est en cours de reconfiguration. Réessayez après la fin de l’opération.",
      409,
      "RUNTIME_MUTATION_IN_PROGRESS",
    );
  }
  exclusion.runReservations += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    exclusion.runReservations = Math.max(0, exclusion.runReservations - 1);
  };
}

export function assertRuntimeMutationIdle() {
  if (!exclusion.mutationLease) return;
  throw new HermesRuntimeError(
    "Le runtime Hermes est en cours de reconfiguration. Réessayez après la fin de l’opération.",
    409,
    "RUNTIME_MUTATION_IN_PROGRESS",
  );
}
