import { describe, expect, test } from "bun:test";
import type { GuidedInboxTaskSummary } from "@console/core/modules/guided-task/task";
import type { InboxMissionSummary } from "@console/core/modules/runs/types";
import {
  buildInboxItems,
  canActOn,
  groupInboxSections,
  guidedTaskInboxItem,
  isOverdueWait,
  missionInboxItem,
  pendingDecisionLabel,
  waitingSince,
  type InboxActor,
  type InboxItem,
} from "./inbox";

function task(overrides: Partial<GuidedInboxTaskSummary> = {}): GuidedInboxTaskSummary {
  return {
    id: "task_1",
    title: "Espace client",
    status: "ready",
    projectName: "Portail Acme",
    currentRevision: { id: "rev_1", state: "validated", requiresTechnicalApproval: false },
    latestAttempt: null,
    decisions: [],
    updatedAt: "2026-08-08T10:00:00.000Z",
    ...overrides,
  };
}

function decision(
  kind: "plan" | "technical" | "tool" | "functional",
  outcome: "approved" | "rejected",
  attemptId: string | null = null,
) {
  return { kind, outcome, attemptId };
}

describe("décision réclamée", () => {
  test("l’approbation d’outil passe avant tout le reste", () => {
    expect(pendingDecisionLabel(task())).toBe("Approbation d’outil attendue");
  });

  test("la validation technique n’est réclamée que si la révision l’exige", () => {
    const withoutTechnical = task({ decisions: [decision("tool", "approved")] });
    expect(pendingDecisionLabel(withoutTechnical)).toBeNull();
    expect(pendingDecisionLabel({
      ...withoutTechnical,
      currentRevision: { ...withoutTechnical.currentRevision!, requiresTechnicalApproval: true },
    })).toBe("Validation technique attendue");
  });

  test("la validation fonctionnelle attend une tentative de la révision courante", () => {
    const awaiting = task({
      decisions: [decision("tool", "approved")],
      latestAttempt: { id: "att_1", revisionId: "rev_1", status: "awaiting_functional_validation" },
    });
    expect(pendingDecisionLabel(awaiting)).toBe("Validation fonctionnelle attendue");
  });

  test("R1 en attente puis R2 courante ne réclame jamais une validation fonctionnelle sur R1", () => {
    const r2 = task({
      currentRevision: { id: "rev_2", state: "validated", requiresTechnicalApproval: false },
      decisions: [decision("tool", "approved")],
      latestAttempt: { id: "att_r1", revisionId: "rev_1", status: "awaiting_functional_validation" },
    });
    expect(pendingDecisionLabel(r2)).toBeNull();
    expect(guidedTaskInboxItem(r2)).toBeNull();
  });
});

describe("projection de l’Inbox", () => {
  test("le contexte vient du résumé projet, sans fetch repository séparé", () => {
    expect(guidedTaskInboxItem(task())?.context).toBe("Portail Acme");
    expect(buildInboxItems({ tasks: [task()], missions: [] })[0]?.context).toBe("Portail Acme");
  });

  test("une tâche terminée quitte la file", () => {
    expect(guidedTaskInboxItem(task({ status: "completed" }))).toBeNull();
  });

  test("un refus sur le mandat courant maintient la tâche à reprendre", () => {
    expect(guidedTaskInboxItem(task({ decisions: [decision("tool", "rejected")] }))?.category).toBe("failure");
  });

  test("un échec n’affiche jamais une sortie d’exécution brute", () => {
    const failed = {
      ...task({ status: "failed" }),
      latestAttempt: {
        id: "att_1",
        revisionId: "rev_1",
        status: "failed" as const,
        error: "SENTINEL_STDERR_SECRET",
      },
    } as unknown as GuidedInboxTaskSummary;
    const item = guidedTaskInboxItem(failed);
    expect(item?.preview).toBe("Exécution interrompue");
    expect(item?.preview).not.toContain("SENTINEL_STDERR_SECRET");
  });

  test("un verdict fonctionnel d’une autre tentative ne masque pas l’attente courante", () => {
    const item = guidedTaskInboxItem(task({
      decisions: [decision("tool", "approved"), decision("functional", "rejected", "att_1")],
      latestAttempt: { id: "att_2", revisionId: "rev_1", status: "awaiting_functional_validation" },
    }));
    expect(item?.category).toBe("needs_action");
    expect(item?.preview).toBe("Validation fonctionnelle attendue");
  });

  test("un échec mission n’affiche jamais une sortie d’exécution brute", () => {
    const item = missionInboxItem({
      id: "run_secret",
      title: "Mission",
      agentName: "Agent",
      updatedAt: "2026-08-09T10:00:00.000Z",
      latestRun: { status: "failed", error: "SENTINEL_MISSION_STDERR_SECRET" } as unknown as InboxMissionSummary["latestRun"],
    });
    expect(item?.preview).toBe("Exécution interrompue");
    expect(item?.preview).not.toContain("SENTINEL_MISSION_STDERR_SECRET");
  });
});

describe("qui peut agir", () => {
  const actor = (role: InboxActor["role"], ...capabilities: string[]): InboxActor => ({ capabilities: new Set(capabilities), role });

  test("une validation fonctionnelle n’est promise qu’au demandeur", () => {
    expect(canActOn({ action: "decide", kind: "functional" }, actor("requester", "guided.task.decide"))).toBe(true);
    expect(canActOn({ action: "decide", kind: "functional" }, actor("approver", "guided.task.decide"))).toBe(false);
  });

  test("un brouillon sans update ni execute devient une activité et sort du compteur actionnable", () => {
    const draft = task({
      status: "draft",
      currentRevision: { id: "rev_1", state: "draft", requiresTechnicalApproval: false },
    });
    const sections = groupInboxSections(buildInboxItems({ tasks: [draft], missions: [] }), {
      capabilities: new Set(["guided.task.read"]),
      role: "approver",
    });
    expect(sections.map((section) => section.id)).toEqual(["in_progress"]);
    expect(sections[0]?.items).toHaveLength(1);
  });

  test("un brouillon reste actionnable pour update ou execute", () => {
    const draft = task({ status: "draft", currentRevision: { id: "rev_1", state: "draft", requiresTechnicalApproval: false } });
    const sections = groupInboxSections(buildInboxItems({ tasks: [draft], missions: [] }), {
      capabilities: new Set(["guided.task.update"]), role: "requester",
    });
    expect(sections.map((section) => section.id)).toEqual(["draft"]);
  });
});

describe("sections de l’Inbox", () => {
  const mission: InboxMissionSummary = {
    id: "run_1", title: "Import mensuel", agentName: "Opérateur fichiers", updatedAt: "2026-08-08T11:00:00.000Z",
    latestRun: { status: "running" },
  };

  test("les sections séparent décision, reprise, brouillon et activité", () => {
    const failed = task({ id: "task_2", status: "failed", decisions: [decision("tool", "rejected")] });
    const draft = task({ id: "task_3", status: "draft", currentRevision: { id: "rev_3", state: "draft", requiresTechnicalApproval: false } });
    const sections = groupInboxSections(buildInboxItems({ tasks: [task(), failed, draft], missions: [mission] }));
    expect(sections.map((section) => section.id)).toEqual(["needs_action", "failure", "draft", "in_progress"]);
  });

  test("sans droit sur la décision réclamée, elle reste visible dans les activités", () => {
    const sections = groupInboxSections(buildInboxItems({ tasks: [task()], missions: [] }), {
      capabilities: new Set(["guided.task.decide"]), role: "requester",
    });
    expect(sections.map((section) => section.id)).toEqual(["in_progress"]);
  });

  test("les missions d’approbation suivent leur capacité dédiée", () => {
    expect(missionInboxItem({ ...mission, latestRun: { status: "awaiting_approval" } })?.requirement)
      .toEqual({ action: "approve_run" });
  });
});

describe("waitingSince", () => {
  const now = new Date("2026-08-08T12:00:00.000Z").getTime();
  test("formate l’âge et l’alerte à 24 h", () => {
    expect(waitingSince("2026-08-08T11:45:00.000Z", now)).toBe("depuis 15 min");
    expect(isOverdueWait("2026-08-07T12:00:00.000Z", now)).toBe(true);
  });

  test("trie les attentes les plus anciennes d’abord", () => {
    const recent: InboxItem = { conversationId: "recent", href: "/tasks/recent", title: "Récent", context: "Projet", preview: "", categories: ["needs_action"], category: "needs_action", isActionRequired: true, latestActivityAt: "2026-08-08T12:00:00.000Z", requirement: null };
    const old = { ...recent, conversationId: "old", latestActivityAt: "2026-08-08T08:00:00.000Z" };
    expect(groupInboxSections([recent, old])[0]?.items.map((item) => item.conversationId)).toEqual(["old", "recent"]);
  });
});
