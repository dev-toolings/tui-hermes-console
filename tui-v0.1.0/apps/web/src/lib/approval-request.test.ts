import { describe, expect, test } from "bun:test";
import {
  approvalChoiceLabel,
  approvalChoiceShortcut,
  approvalDecisionLabel,
  canRespondToApproval,
  orderApprovalChoices,
  parseApprovalScan,
  requiresConfirmation,
} from "./approval-request";

/**
 * La description telle que Hermes 0.19.0 l'a envoyée — copiée depuis
 * `run_events.payload.description` en base, sauts de ligne compris. Une fixture
 * inventée validerait notre découpage contre notre propre imagination.
 */
const REAL_DESCRIPTION =
  "Security scan — [HIGH] Pipe to interpreter: curl | python3: Command pipes output from 'curl' " +
  "directly to interpreter 'python3'. Downloaded content will be executed without inspection.\n" +
  "  Safer: tirith run https://wttr.in/Paris?format=j1  — or: vet https://wttr.in/Paris?format=j1 " +
  " (https://getvet.sh); script execution via heredoc";

describe("parseApprovalScan", () => {
  test("découpe la description réelle du scanner", () => {
    const scan = parseApprovalScan(REAL_DESCRIPTION);

    expect(scan.severity).toBe("HIGH");
    expect(scan.title).toBe("Pipe to interpreter: curl | python3");
    expect(scan.detail).toBe(
      "Command pipes output from 'curl' directly to interpreter 'python3'. " +
        "Downloaded content will be executed without inspection.",
    );
    expect(scan.safer).toEqual([
      "tirith run https://wttr.in/Paris?format=j1",
      "vet https://wttr.in/Paris?format=j1 (https://getvet.sh); script execution via heredoc",
    ]);
  });

  test("ne coupe pas les URLs sur leur deux-points", () => {
    const scan = parseApprovalScan("[LOW] Fetch: curl https://example.com/a:b");
    expect(scan.severity).toBe("LOW");
    expect(scan.title).toBe("Fetch");
    expect(scan.detail).toBe("curl https://example.com/a:b");
  });

  test("description libre : tout ressort en detail, rien n'est inventé", () => {
    const scan = parseApprovalScan("L’agent veut écrire un fichier");
    expect(scan).toEqual({
      severity: null,
      title: null,
      detail: "L’agent veut écrire un fichier",
      safer: [],
    });
  });

  test("absence de description : aucun champ, aucune exception", () => {
    for (const value of [null, undefined, "", "   "]) {
      expect(parseApprovalScan(value)).toEqual({
        severity: null,
        title: null,
        detail: null,
        safer: [],
      });
    }
  });

  test("une seule alternative « Safer » reste une entrée", () => {
    const scan = parseApprovalScan("[MEDIUM] Write file: overwrites config.\n  Safer: edit in place");
    expect(scan.severity).toBe("MEDIUM");
    expect(scan.safer).toEqual(["edit in place"]);
  });
});

describe("orderApprovalChoices", () => {
  test("refuser d’abord, puis de la portée la plus étroite à la plus large", () => {
    expect(orderApprovalChoices(["once", "deny"])).toEqual(["deny", "once"]);
    expect(orderApprovalChoices(["always", "once", "deny"])).toEqual([
      "deny",
      "once",
      "always",
    ]);
    expect(orderApprovalChoices(["always", "session", "once", "deny"])).toEqual([
      "deny",
      "once",
      "session",
      "always",
    ]);
  });

  test("écarte ce qu’Hermes refuserait, et dédoublonne", () => {
    expect(orderApprovalChoices(["yolo", "once", "once"])).toEqual(["once"]);
  });

  test("liste vide ou entièrement inconnue → repli sur les deux réponses sûres", () => {
    expect(orderApprovalChoices([])).toEqual(["deny", "once"]);
    expect(orderApprovalChoices(["yolo"])).toEqual(["deny", "once"]);
    expect(orderApprovalChoices(null)).toEqual(["deny", "once"]);
  });
});

describe("libellés et raccourcis", () => {
  test("un bouton à l’infinitif, une trace au participe", () => {
    expect(approvalChoiceLabel("once")).toBe("Autoriser une fois");
    expect(approvalChoiceLabel("session")).toBe("Autoriser pour la session");
    expect(approvalChoiceLabel("always")).toBe("Toujours autoriser");
    expect(approvalChoiceLabel("deny")).toBe("Refuser");

    expect(approvalDecisionLabel("once")).toBe("Autorisé une fois");
    expect(approvalDecisionLabel("session")).toBe("Autorisé pour la session");
    expect(approvalDecisionLabel("always")).toBe("Toujours autorisé");
    expect(approvalDecisionLabel("deny")).toBe("Refusé");
  });

  test("les neuf premiers choix ont un chiffre, pas les suivants", () => {
    expect(approvalChoiceShortcut(0)).toBe("1");
    expect(approvalChoiceShortcut(8)).toBe("9");
    expect(approvalChoiceShortcut(9)).toBeNull();
    expect(approvalChoiceShortcut(-1)).toBeNull();
  });
});

describe("requiresConfirmation", () => {
  test("seul « toujours » engage au-delà de la mission", () => {
    expect(requiresConfirmation("always")).toBe(true);
    expect(requiresConfirmation("session")).toBe(false);
    expect(requiresConfirmation("once")).toBe(false);
    expect(requiresConfirmation("deny")).toBe(false);
  });
});

describe("canRespondToApproval", () => {
  const ready = { sending: false, connected: true, status: "awaiting_approval" as const };

  test("prêt : mission en attente, runtime joignable, aucun envoi en vol", () => {
    expect(canRespondToApproval(ready)).toBe(true);
  });

  test("ferme la porte pendant l’envoi, hors ligne, ou si la mission n’attend plus", () => {
    expect(canRespondToApproval({ ...ready, sending: true })).toBe(false);
    expect(canRespondToApproval({ ...ready, connected: false })).toBe(false);
    expect(canRespondToApproval({ ...ready, status: "running" })).toBe(false);
    expect(canRespondToApproval({ ...ready, status: "completed" })).toBe(false);
    expect(canRespondToApproval({ ...ready, status: null })).toBe(false);
  });
});
