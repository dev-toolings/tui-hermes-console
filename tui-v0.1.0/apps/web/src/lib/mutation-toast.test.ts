import { describe, expect, test } from "bun:test";
import {
  mutationToastTitle,
  parseMutationToastIntent,
} from "./mutation-toast";

describe("mutation toast contract", () => {
  test.each([
    ["created", "Créé", "Création échouée"],
    ["updated", "Mis à jour", "Mise à jour échouée"],
    ["deleted", "Supprimé", "Suppression échouée"],
  ] as const)("classifies %s with exact CRUD copy", (value, success, failure) => {
    const intent = parseMutationToastIntent(value);
    expect(intent).toBe(value);
    if (!intent || intent === "silent") throw new Error("Expected a CRUD intent");
    expect(mutationToastTitle(intent, true)).toBe(success);
    expect(mutationToastTitle(intent, false)).toBe(failure);
  });

  test.each(["0", "false", "silent"])("classifies %s as silent", (value) => {
    expect(parseMutationToastIntent(value)).toBe("silent");
  });

  test.each([undefined, null, "", "create", "success", "updated-now"])(
    "does not guess an intent from %s",
    (value) => {
      expect(parseMutationToastIntent(value)).toBeNull();
    },
  );
});
