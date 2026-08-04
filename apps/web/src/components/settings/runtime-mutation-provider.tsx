"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { LoaderCircleIcon, ShieldAlertIcon } from "lucide-react";

type MutationState = {
  label: string;
  detail: string;
  progress: number;
};

type RuntimeMutationOptions = {
  timeoutMs?: number;
};

type RuntimeMutationTask<T> = (signal: AbortSignal) => Promise<T>;

type RuntimeMutationContextValue = {
  runMutation: <T>(
    label: string,
    task: RuntimeMutationTask<T>,
    options?: RuntimeMutationOptions,
  ) => Promise<T>;
  beginMutation: (label: string, detail?: string) => boolean;
  updateMutation: (label: string, progress: number, detail?: string) => void;
  finishMutation: () => Promise<void>;
  failMutation: () => void;
};

const noopContext: RuntimeMutationContextValue = {
  runMutation: async <T,>(_label: string, task: RuntimeMutationTask<T>) =>
    task(new AbortController().signal),
  beginMutation: () => true,
  updateMutation: () => undefined,
  finishMutation: async () => undefined,
  failMutation: () => undefined,
};

const RuntimeMutationContext = createContext<RuntimeMutationContextValue | null>(null);

export function RuntimeMutationProvider({ children }: { children: ReactNode }) {
  const [mutation, setMutation] = useState<MutationState | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const mutationRef = useRef<MutationState | null>(null);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTicker = useCallback(() => {
    if (tickerRef.current) clearInterval(tickerRef.current);
    tickerRef.current = null;
  }, []);

  const closeMutation = useCallback(() => {
    clearTicker();
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
    mutationRef.current = null;
    setMutation(null);
  }, [clearTicker]);

  const beginMutation = useCallback(
    (label: string, detail = "Les commandes de cette page sont verrouillées jusqu’à la fin.") => {
      if (mutationRef.current) return false;
      const next: MutationState = { label, detail, progress: 8 };
      mutationRef.current = next;
      setMutation(next);
      clearTicker();
      tickerRef.current = setInterval(() => {
        setMutation((current) => {
          if (!current) return current;
          const nextProgress = Math.min(88, current.progress + 2);
          const nextState = {
            ...current,
            progress: nextProgress,
            ...(nextProgress === 88
              ? { detail: "Le serveur n’a pas encore confirmé la fin. Le délai de sécurité reste actif." }
              : {}),
          };
          mutationRef.current = nextState;
          return nextState;
        });
      }, 350);
      return true;
    },
    [clearTicker],
  );

  const updateMutation = useCallback((label: string, progress: number, detail?: string) => {
    if (!mutationRef.current) return;
    const next = {
      ...mutationRef.current,
      label,
      progress: Math.max(8, Math.min(96, Math.round(progress))),
      ...(detail ? { detail } : {}),
    };
    mutationRef.current = next;
    setMutation(next);
  }, []);

  const finishMutation = useCallback(async () => {
    if (!mutationRef.current) return;
    clearTicker();
    const finished = { ...mutationRef.current, progress: 100 };
    mutationRef.current = finished;
    setMutation(finished);
    await new Promise<void>((resolve) => {
      closeTimerRef.current = setTimeout(resolve, 260);
    });
    closeMutation();
  }, [clearTicker, closeMutation]);

  const failMutation = useCallback(() => {
    closeMutation();
  }, [closeMutation]);

  const runMutation = useCallback(
    async <T,>(label: string, task: RuntimeMutationTask<T>, options?: RuntimeMutationOptions) => {
      if (!beginMutation(label)) {
        throw new Error("Une autre opération runtime est déjà en cours.");
      }
      const controller = new AbortController();
      const timeoutMs = options?.timeoutMs ?? 90_000;
      let timeout: ReturnType<typeof setTimeout> | null = null;
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            controller.abort();
            reject(new Error("L’opération runtime dépasse le délai de 90 secondes."));
          }, timeoutMs);
        });
        const result = await Promise.race([task(controller.signal), timeoutPromise]);
        await finishMutation();
        return result;
      } catch (error) {
        failMutation();
        throw error;
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    },
    [beginMutation, failMutation, finishMutation],
  );

  useEffect(() => {
    if (!mutation) return;
    const previousOverflow = document.body.style.overflow;
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("beforeunload", preventUnload);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("beforeunload", preventUnload);
    };
  }, [mutation]);

  useEffect(() => {
    contentRef.current?.toggleAttribute("inert", Boolean(mutation));
  }, [mutation]);

  useEffect(() => {
    return () => {
      clearTicker();
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, [clearTicker]);

  const value: RuntimeMutationContextValue = {
    runMutation,
    beginMutation,
    updateMutation,
    finishMutation,
    failMutation,
  };

  return (
    <RuntimeMutationContext.Provider value={value}>
      <div ref={contentRef} aria-hidden={mutation ? true : undefined}>
        {children}
      </div>
      {mutation ? <RuntimeMutationOverlay mutation={mutation} /> : null}
    </RuntimeMutationContext.Provider>
  );
}

export function useRuntimeMutation() {
  return useContext(RuntimeMutationContext) ?? noopContext;
}

function RuntimeMutationOverlay({ mutation }: { mutation: MutationState }) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    const preventEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("keydown", preventEscape, true);
    return () => window.removeEventListener("keydown", preventEscape, true);
  }, []);

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-[110] h-1 bg-primary/20" aria-hidden="true">
        <div
          className="h-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${mutation.progress}%` }}
        />
      </div>
      <div
        className="fixed inset-0 z-[109] flex items-center justify-center bg-background/80 px-4"
        role="presentation"
        onKeyDown={(event) => {
          if (event.key === "Escape") event.preventDefault();
        }}
        onPointerDown={(event) => event.preventDefault()}
      >
        <div
          ref={dialogRef}
          aria-describedby="runtime-mutation-detail"
          aria-labelledby="runtime-mutation-title"
          aria-modal="true"
          className="w-full max-w-md rounded-2xl border border-seam bg-card p-5 shadow-board-elevated"
          role="dialog"
          tabIndex={-1}
        >
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <LoaderCircleIcon className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 id="runtime-mutation-title" className="text-[0.875rem] font-semibold">
                {mutation.label}
              </h2>
              <p id="runtime-mutation-detail" className="mt-1 text-[0.6875rem] leading-5 text-muted-foreground">
                {mutation.detail}
              </p>
            </div>
          </div>
          <div className="mt-5 space-y-2" aria-live="polite" role="status">
            <div className="flex items-center justify-between gap-3 text-[0.6875rem] text-muted-foreground">
              <span>Progression de l’opération</span>
              <span className="font-mono tabular-nums">{mutation.progress}%</span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="Progression de l’opération runtime"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={mutation.progress}
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
                style={{ width: `${mutation.progress}%` }}
              />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 border-t border-seam pt-3 text-[0.6875rem] text-muted-foreground">
            <ShieldAlertIcon className="size-3.5 shrink-0" aria-hidden="true" />
            <span>Ne fermez pas cette fenêtre et ne rechargez pas la page.</span>
          </div>
        </div>
      </div>
    </>
  );
}
