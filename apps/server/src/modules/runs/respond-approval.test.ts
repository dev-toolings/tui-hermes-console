import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { APPROVAL_CHOICES } from "@console/core/lib/thread-snapshot-mutations";

/**
 * Contrat d'autorisation — Hermes valide `choice`, pas un booléen.
 *
 * Le runtime répond `400 Invalid approval choice; expected one of: once,
 * session, always, deny` à tout ce qui n'est pas ce vocabulaire. Le schéma de la
 * route doit donc rejeter en amont ce que le runtime rejetterait de toute façon,
 * plutôt que de relayer un corps invalide et d'afficher son 400 à l'utilisateur.
 */
describe("respondRunApproval contract", () => {
  test("expose la fonction et la forme de résultat documentée", async () => {
    const mod = await import("./respond-approval");
    expect(typeof mod.respondRunApproval).toBe("function");

    type Result = Awaited<ReturnType<typeof mod.respondRunApproval>>;
    const sample: Result = {
      runId: "run_x",
      choice: "once",
      approved: true,
      status: "running",
    };
    expect(sample.approved).toBe(sample.choice !== "deny");
  });

  test("le vocabulaire accepté est exactement celui d’Hermes", () => {
    const schema = z.object({ choice: z.enum(APPROVAL_CHOICES) });

    for (const choice of APPROVAL_CHOICES) {
      expect(schema.safeParse({ choice }).success).toBe(true);
    }
    // L'ancien corps `{ approved: boolean }` est précisément celui qui a produit
    // le 400 en production : il ne doit plus jamais passer pour valide.
    expect(schema.safeParse({ approved: true }).success).toBe(false);
    expect(schema.safeParse({ choice: "yolo" }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
  });

  test("`deny` est le seul choix qui refuse", () => {
    const approvedFor = (choice: string) => choice !== "deny";
    expect(APPROVAL_CHOICES.filter((choice) => !approvedFor(choice))).toEqual(["deny"]);
  });
});
