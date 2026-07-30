export type ThemePreference = "light" | "dark" | "system";

export type NotificationPreferences = {
  onComplete: boolean;
  onFailed: boolean;
  onApproval: boolean;
  browserNotifications: boolean;
};

const THEME_KEY = "hermes-theme";
const NOTIFICATIONS_KEY = "hermes-notifications";
const CHANGE_EVENT = "hermes-preferences-change";

export const DEFAULT_NOTIFICATIONS: NotificationPreferences = {
  onComplete: true,
  onFailed: true,
  onApproval: true,
  browserNotifications: false,
};

let cachedNotificationRaw: string | null | undefined;
let cachedNotificationPrefs: NotificationPreferences = DEFAULT_NOTIFICATIONS;

export function getThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "system";
}

export function setThemePreference(mode: ThemePreference) {
  window.localStorage.setItem(THEME_KEY, mode);
  applyThemePreference(mode);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function resolveThemeDark(mode: ThemePreference): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyThemePreference(mode: ThemePreference) {
  document.documentElement.classList.toggle("dark", resolveThemeDark(mode));
}

export function getNotificationPreferences(): NotificationPreferences {
  if (typeof window === "undefined") return DEFAULT_NOTIFICATIONS;
  try {
    const raw = window.localStorage.getItem(NOTIFICATIONS_KEY);
    if (raw === cachedNotificationRaw) return cachedNotificationPrefs;
    if (!raw) {
      cachedNotificationRaw = null;
      cachedNotificationPrefs = DEFAULT_NOTIFICATIONS;
      return cachedNotificationPrefs;
    }
    const stored = JSON.parse(raw) as Partial<NotificationPreferences>;
    cachedNotificationRaw = raw;
    cachedNotificationPrefs = { ...DEFAULT_NOTIFICATIONS, ...stored };
    return cachedNotificationPrefs;
  } catch {
    cachedNotificationRaw = undefined;
    cachedNotificationPrefs = DEFAULT_NOTIFICATIONS;
    return DEFAULT_NOTIFICATIONS;
  }
}

export function getServerNotificationPreferences(): NotificationPreferences {
  return DEFAULT_NOTIFICATIONS;
}

export function setNotificationPreferences(next: NotificationPreferences) {
  const raw = JSON.stringify(next);
  window.localStorage.setItem(NOTIFICATIONS_KEY, raw);
  cachedNotificationRaw = raw;
  cachedNotificationPrefs = next;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeToPreferences(onStoreChange: () => void) {
  const onSystemTheme = () => onStoreChange();
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(CHANGE_EVENT, onStoreChange);
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", onSystemTheme);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(CHANGE_EVENT, onStoreChange);
    window.matchMedia("(prefers-color-scheme: dark)").removeEventListener("change", onSystemTheme);
  };
}
