const SCOPE_EVENT = "hermes-console:cache-scope-changed";
const SCOPED_STORAGE_PREFIXES = [
  "hermes-console:thread-chrome:",
  "hermes-console:chat-sessions:",
] as const;

let currentScope = "anonymous";

function normalize(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase() || null;
}

export function setSessionCacheScope(
  userKey: string | null | undefined,
  siteId: string | null | undefined,
  mandateId?: string | null,
) {
  const user = normalize(userKey);
  const site = normalize(siteId);
  const mandate = normalize(mandateId);
  const next = user && site
    ? `${encodeURIComponent(user)}:${encodeURIComponent(site)}:${encodeURIComponent(mandate ?? "none")}`
    : "anonymous";
  if (next === currentScope) return;
  currentScope = next;
  if (typeof window === "undefined") return;

  for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
    const key = sessionStorage.key(index);
    if (key && SCOPED_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      sessionStorage.removeItem(key);
    }
  }
  window.dispatchEvent(new Event(SCOPE_EVENT));
}

export function getSessionCacheScope() {
  return currentScope;
}

export function scopedSessionStorageKey(base: string) {
  return `${base}:${currentScope}`;
}

export function onSessionCacheScopeChange(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(SCOPE_EVENT, listener);
  return () => window.removeEventListener(SCOPE_EVENT, listener);
}
