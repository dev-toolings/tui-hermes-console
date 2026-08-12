// Bun exposes this module at runtime; the project deliberately has no Bun type package.
// @ts-expect-error Bun test types are not part of the application build.
import { describe, expect, test } from "bun:test";
import {
  EMPTY_QUESTIONNAIRE,
  hasOnboarded,
  isValidCode,
  isValidEmail,
  migrateAuthState,
  nameFromEmail,
  safeRedirect,
  useAuthStore,
} from "./auth-store";

describe("nameFromEmail", () => {
  test("builds a display name from the local part", () => {
    expect(nameFromEmail("jane.doe@kweli.tech")).toBe("Jane Doe");
    expect(nameFromEmail("jean-luc_martin@example.com")).toBe("Jean Luc Martin");
  });

  test("ignores plus-addressing", () => {
    expect(nameFromEmail("jane+lab@kweli.tech")).toBe("Jane");
  });
});

describe("validation", () => {
  test("accepts plausible emails only", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("not an email")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
  });

  test("accepts exactly six digits", () => {
    expect(isValidCode("123456")).toBe(true);
    expect(isValidCode("12345")).toBe(false);
    expect(isValidCode("12345a")).toBe(false);
  });
});

describe("migrateAuthState", () => {
  test("accepts a well-formed record", () => {
    const parsed = migrateAuthState({
      version: 1,
      user: { email: "a@b.co", name: "A" },
      onboardedEmails: ["a@b.co"],
      questionnaire: { ...EMPTY_QUESTIONNAIRE, role: "engineer" },
    });
    expect(parsed?.user?.email).toBe("a@b.co");
    expect(parsed?.questionnaire.role).toBe("engineer");
  });

  test("rejects foreign shapes", () => {
    expect(migrateAuthState(null)).toBeNull();
    expect(migrateAuthState({ version: 2 })).toBeNull();
    expect(migrateAuthState({ version: 1, user: "x", onboardedEmails: [] })).toBeNull();
    expect(migrateAuthState({ version: 1, user: null, onboardedEmails: [3] })).toBeNull();
  });

  test("fills a missing questionnaire with the empty default", () => {
    const parsed = migrateAuthState({ version: 1, user: null, onboardedEmails: [] });
    expect(parsed?.questionnaire).toEqual(EMPTY_QUESTIONNAIRE);
  });
});

describe("auth store", () => {
  test("verifyCode signs in with any six-digit code, logout clears the user", () => {
    const store = useAuthStore.getState();
    expect(store.verifyCode("jane@kweli.tech", "12345")).toBeNull();
    const user = useAuthStore.getState().verifyCode("jane@kweli.tech", "000000");
    expect(user?.name).toBe("Jane");
    expect(useAuthStore.getState().user?.email).toBe("jane@kweli.tech");
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().user).toBeNull();
  });

  test("onboarding survives logout for the same email", () => {
    useAuthStore.getState().verifyCode("jane@kweli.tech", "000000");
    useAuthStore.getState().completeOnboarding();
    expect(hasOnboarded(useAuthStore.getState())).toBe(true);
    useAuthStore.getState().logout();
    expect(hasOnboarded(useAuthStore.getState())).toBe(false);
    useAuthStore.getState().verifyCode("jane@kweli.tech", "111111");
    expect(hasOnboarded(useAuthStore.getState())).toBe(true);
  });
});

describe("safeRedirect", () => {
  test("keeps only in-app paths", () => {
    expect(safeRedirect("/marketplace/inbox")).toBe("/marketplace/inbox");
    expect(safeRedirect("//evil.example")).toBeUndefined();
    expect(safeRedirect("https://evil.example")).toBeUndefined();
    expect(safeRedirect(42)).toBeUndefined();
  });
});
