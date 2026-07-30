import type { StoredProductEvent } from "./types";

type Listener = (event: StoredProductEvent) => void;

const globalBus = globalThis as typeof globalThis & {
  hermesConsoleEventListeners?: Map<string, Set<Listener>>;
};

const listeners =
  globalBus.hermesConsoleEventListeners ??
  (globalBus.hermesConsoleEventListeners = new Map<string, Set<Listener>>());

export function publishThreadEvent(threadId: string, event: StoredProductEvent) {
  for (const listener of listeners.get(threadId) ?? []) listener(event);
}

export function subscribeToThread(threadId: string, listener: Listener) {
  const threadListeners = listeners.get(threadId) ?? new Set<Listener>();
  threadListeners.add(listener);
  listeners.set(threadId, threadListeners);

  return () => {
    threadListeners.delete(listener);
    if (threadListeners.size === 0) listeners.delete(threadId);
  };
}
