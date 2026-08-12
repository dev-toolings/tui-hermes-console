/**
 * Fake local authentication, modelled on multica's auth store
 * (packages/core/auth/store.ts): a zustand store with manual localStorage
 * persistence — no persist middleware — hydrated once at creation.
 *
 * Passwordless like multica: an email requests a code, any 6-digit code
 * verifies it. Nothing leaves the browser; this exists so the org-scoped
 * routes have a session to guard on.
 */
import { create } from "zustand";

export const AUTH_STORAGE_KEY = "hermes:auth";
export const CODE_COOLDOWN_SECONDS = 60;

export type AuthUser = { email: string; name: string };

/** Same shape as multica's onboarding questionnaire, minus server versioning. */
export type QuestionnaireAnswers = {
  role: string | null;
  role_other: string | null;
  role_skipped: boolean;
  use_case: string[];
  use_case_other: string | null;
  use_case_skipped: boolean;
};

export const EMPTY_QUESTIONNAIRE: QuestionnaireAnswers = {
  role: null,
  role_other: null,
  role_skipped: false,
  use_case: [],
  use_case_other: null,
  use_case_skipped: false,
};

type PersistedAuth = {
  version: 1;
  user: AuthUser | null;
  /** Onboarding survives logout, like multica's server-side onboarded_at. */
  onboardedEmails: string[];
  questionnaire: QuestionnaireAnswers;
};

export type AuthState = {
  user: AuthUser | null;
  onboardedEmails: string[];
  questionnaire: QuestionnaireAnswers;
  sendCode: (email: string) => void;
  verifyCode: (email: string, code: string) => AuthUser | null;
  completeOnboarding: () => void;
  saveQuestionnaire: (patch: Partial<QuestionnaireAnswers>) => void;
  logout: () => void;
};

/** "jane.doe+lab@kweli.tech" → "Jane Doe". */
export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const words = local.split("+")[0].split(/[._-]+/).filter(Boolean);
  if (!words.length) return email;
  return words
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function isValidCode(code: string): boolean {
  return /^\d{6}$/.test(code);
}

/** Parse a persisted record without consulting localStorage, for tests. */
export function migrateAuthState(value: unknown): PersistedAuth | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== 1) return null;
  const user = record.user;
  if (user !== null) {
    if (typeof user !== "object") return null;
    const candidate = user as Record<string, unknown>;
    if (typeof candidate.email !== "string" || typeof candidate.name !== "string")
      return null;
  }
  if (
    !Array.isArray(record.onboardedEmails) ||
    !record.onboardedEmails.every((entry) => typeof entry === "string")
  )
    return null;
  const questionnaire =
    typeof record.questionnaire === "object" && record.questionnaire !== null
      ? { ...EMPTY_QUESTIONNAIRE, ...(record.questionnaire as Partial<QuestionnaireAnswers>) }
      : EMPTY_QUESTIONNAIRE;
  return {
    version: 1,
    user: user as AuthUser | null,
    onboardedEmails: record.onboardedEmails as string[],
    questionnaire,
  };
}

function loadAuthState(): PersistedAuth {
  const empty: PersistedAuth = {
    version: 1,
    user: null,
    onboardedEmails: [],
    questionnaire: EMPTY_QUESTIONNAIRE,
  };
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return empty;
    return migrateAuthState(JSON.parse(raw)) ?? empty;
  } catch {
    return empty;
  }
}

function saveAuthState(state: PersistedAuth) {
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* the fake session simply becomes memory-only */
  }
}

export const useAuthStore = create<AuthState>((set, get) => {
  const persisted = loadAuthState();

  const persist = () => {
    const { user, onboardedEmails, questionnaire } = get();
    saveAuthState({ version: 1, user, onboardedEmails, questionnaire });
  };

  return {
    user: persisted.user,
    onboardedEmails: persisted.onboardedEmails,
    questionnaire: persisted.questionnaire,

    // Fake — nothing is sent anywhere; the login screen states that any
    // 6-digit code passes. Kept as an action so the UI flow mirrors multica.
    sendCode: () => {},

    verifyCode: (email: string, code: string) => {
      if (!isValidEmail(email) || !isValidCode(code)) return null;
      const user = { email: email.trim(), name: nameFromEmail(email.trim()) };
      set({ user });
      persist();
      return user;
    },

    completeOnboarding: () => {
      const { user, onboardedEmails } = get();
      if (!user || onboardedEmails.includes(user.email)) return;
      set({ onboardedEmails: [...onboardedEmails, user.email] });
      persist();
    },

    saveQuestionnaire: (patch: Partial<QuestionnaireAnswers>) => {
      set({ questionnaire: { ...get().questionnaire, ...patch } });
      persist();
    },

    logout: () => {
      set({ user: null });
      persist();
    },
  };
});

export function hasOnboarded(state: Pick<AuthState, "user" | "onboardedEmails">): boolean {
  return state.user !== null && state.onboardedEmails.includes(state.user.email);
}

/**
 * Only a path inside this app is ever followed after sign-in — taking the
 * parameter at face value would turn `/login?redirect=https://evil.example`
 * into a phishing hop. Same rule as tanshipfast's auth client.
 */
export function safeRedirect(value: unknown): string | undefined {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : undefined;
}
