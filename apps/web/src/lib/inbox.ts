/**
 * Projection de l'Inbox : une file de décisions, pas une boîte mail.
 *
 * Module de logique pure, sans React ni fetch, pour que la surface mobile
 * (`design/src/data/mock-inbox.ts`) puisse en reprendre les règles à
 * l'identique. Principes qui structurent la file :
 *
 * - un item est une tâche ou une mission, jamais un événement isolé ;
 * - ce qui n'attend plus rien quitte la file : décision prise, reprise
 *   lancée ou tâche terminée. Les tâches terminées ne figurent pas dans cette projection ;
 * - la file se lit en quatre sections par nature plutôt qu'en liste triée par
 *   priorité de catégorie, voir `groupInboxSections` ;
 * - l'âge de l'attente prime sur l'horodatage brut, voir `waitingSince`.
 */
import type { GuidedDecisionKind } from "@console/core/modules/guided-task/spec";
import type { GuidedInboxTaskSummary } from "@console/core/modules/guided-task/task";
import type { InboxMissionSummary } from "@console/core/modules/runs/types";

export type InboxCategory = "needs_action" | "failure" | "agent_activity" | "draft";

/**
 * Ce que la ligne réclame, et de qui. Le serveur restreint chaque décision par
 * nature ET par rôle (`repository.ts:301-309`) : une capacité seule ne dit pas
 * qui peut décider. La file porte donc la nature de l'action, pour ne pas
 * afficher une action que l'API refusera.
 */
export type InboxRequirement =
  | { action: "decide"; kind: GuidedDecisionKind }
  | { action: "approve_run" }
  | { action: "resume"; source: "guided" | "mission" };

export type InboxItem = {
  /** Identité stable de la conversation, indépendante du dernier événement. */
  conversationId: string;
  href: string;
  title: string;
  context: string;
  preview: string;
  categories: InboxCategory[];
  category: InboxCategory;
  isActionRequired: boolean;
  latestActivityAt: string;
  requirement: InboxRequirement | null;
};

export type InboxActor = {
  capabilities: ReadonlySet<string>;
  role: "admin" | "operator" | "requester" | "approver" | "auditor" | null;
};

/**
 * Miroir de la matrice serveur, action par action. Reproduit `allowedDecisionRole`
 * (`apps/server/src/modules/guided-task/repository.ts:301-309`) et les capacités
 * exigées par `apps/server/src/routes.ts`. Ce n'est jamais une autorisation :
 * le serveur reste l'autorité, ceci évite seulement de promettre un geste
 * que l'API refusera.
 */
export function canActOn(requirement: InboxRequirement | null, actor: InboxActor): boolean {
  if (!requirement) return true;
  const { capabilities, role } = actor;

  if (requirement.action === "approve_run") return capabilities.has("run.approve");

  if (requirement.action === "decide") {
    if (!capabilities.has("guided.task.decide")) return false;
    if (requirement.kind === "technical" || requirement.kind === "tool") {
      return role === "admin" || role === "operator" || role === "approver";
    }
    return role === "admin" || role === "requester";
  }

  // Reprendre une mission, c'est la relancer ; reprendre une tâche guidée,
  // c'est préparer une correction, donc `guided.task.update`, que le demandeur
  // possède (`site-authorization.ts:105`).
  return requirement.source === "mission"
    ? capabilities.has("run.retry")
    : capabilities.has("guided.task.update") || capabilities.has("guided.task.execute");
}

export const INBOX_CATEGORY_LABELS: Record<InboxCategory, string> = {
  needs_action: "À décider",
  failure: "Échec",
  agent_activity: "En cours",
  draft: "Brouillon",
};

/** Ordre de tri des catégories : la décision attendue passe avant le reste. */
export const INBOX_CATEGORY_PRIORITY: Record<InboxCategory, number> = {
  needs_action: 0,
  failure: 1,
  agent_activity: 2,
  draft: 3,
};

const DECISION_KINDS: readonly GuidedDecisionKind[] = ["plan", "technical", "tool", "functional"];

function latestOutcome(decisions: GuidedInboxTaskSummary["decisions"], kind: GuidedDecisionKind) {
  return decisions.filter((decision) => decision.kind === kind).at(-1)?.outcome ?? null;
}

/**
 * Les décisions du mandat courant, et elles seules.
 *
 * Le serveur porte la même règle quand il autorise une tentative : il ne
 * charge que les décisions de la révision courante
 * (`apps/server/src/modules/guided-task/delivery.ts:201`). Lire toutes les
 * révisions ferait mentir la file dans les deux sens : un refus corrigé
 * resterait collé à la tâche, et une approbation donnée sur un mandat périmé
 * masquerait une décision que le serveur exigera de nouveau.
 */
/**
 * La décision réclamée, dans l'ordre du parcours. La validation fonctionnelle
 * n'est demandée qu'une fois la tentative en attente de jugement, comme le
 * fait l'écran de détail.
 */
/**
 * Le verdict fonctionnel porte sur une tentative précise, pas sur la tâche
 * (`GuidedDecision.attemptId`, exigé par `repository.ts:370-378`). Le lire à
 * plat ferait qu'un refus sur la tentative 1 masquerait l'attente réelle sur
 * la tentative 2.
 */
function functionalOutcomeForCurrentAttempt(task: GuidedInboxTaskSummary) {
  const attempt = task.latestAttempt;
  if (!attempt || attempt.revisionId !== task.currentRevision?.id) return null;
  return (
    task.decisions
      .filter((decision) => decision.kind === "functional" && decision.attemptId === attempt.id)
      .at(-1)?.outcome ?? null
  );
}

export type PendingDecision = { kind: GuidedDecisionKind; label: string };

export function pendingDecision(task: GuidedInboxTaskSummary): PendingDecision | null {
  const revision = task.currentRevision;
  if (!revision) return null;

  if (revision.state !== "validated") return null;
  if (latestOutcome(task.decisions, "tool") !== "approved") {
    return { kind: "tool", label: "Approbation d’outil attendue" };
  }
  if (revision.requiresTechnicalApproval && latestOutcome(task.decisions, "technical") !== "approved") {
    return { kind: "technical", label: "Validation technique attendue" };
  }
  const attempt = task.latestAttempt;
  if (
    attempt?.revisionId === revision.id &&
    attempt?.status === "awaiting_functional_validation" &&
    functionalOutcomeForCurrentAttempt(task) === null
  ) {
    return { kind: "functional", label: "Validation fonctionnelle attendue" };
  }
  return null;
}

/** Conservé pour les appelants qui n'ont besoin que du libellé. */
export function pendingDecisionLabel(task: GuidedInboxTaskSummary): string | null {
  return pendingDecision(task)?.label ?? null;
}

export function guidedTaskInboxItem(task: GuidedInboxTaskSummary): InboxItem | null {
  // Une tâche acceptée est close : elle vit dans l'historique, pas dans la file.
  if (task.status === "completed") return null;

  const categories: InboxCategory[] = [];
  let preview = "";
  let requirement: InboxRequirement | null = null;

  // Un refus ne colle pas à la tâche : seul le dernier verdict de chaque type,
  // sur le mandat courant et sur la tentative courante pour le fonctionnel,
  // dit si la tâche est bloquée. Un refus corrigé ne la retient plus.
  const rejected =
    DECISION_KINDS.filter((kind) => kind !== "functional").some(
      (kind) => latestOutcome(task.decisions, kind) === "rejected",
    ) || functionalOutcomeForCurrentAttempt(task) === "rejected";
  const failed = task.status === "failed" || rejected;

  if (!failed) {
    const decision = pendingDecision(task);
    if (decision) {
      categories.push("needs_action");
      preview = decision.label;
      requirement = { action: "decide", kind: decision.kind };
    }
  } else {
    categories.push("failure");
    preview = rejected ? "Décision refusée" : "Exécution interrompue";
    requirement = { action: "resume", source: "guided" };
  }

  if (task.status === "running") {
    categories.push("agent_activity");
    if (!preview) preview = "Tentative isolée en cours";
  }

  if (task.status === "draft") {
    categories.push("draft");
    if (!preview) preview = "Brouillon jamais validé";
    requirement = { action: "resume", source: "guided" };
  }

  if (categories.length === 0) return null;
  categories.sort((left, right) => INBOX_CATEGORY_PRIORITY[left] - INBOX_CATEGORY_PRIORITY[right]);

  return {
    conversationId: task.id,
    href: `/tasks/${task.id}`,
    title: task.title,
    context: task.projectName,
    preview,
    categories,
    category: categories[0],
    isActionRequired: categories.includes("needs_action"),
    latestActivityAt: task.updatedAt,
    requirement,
  };
}

export function missionInboxItem(thread: InboxMissionSummary): InboxItem | null {
  const status = thread.latestRun?.status;
  // `awaiting_approval` est le seul état où une mission attend un humain
  // (`ProductRunStatus`, `runs/types.ts:4`). L'oublier fait dire à la file
  // qu'il n'y a rien à faire alors qu'une exécution est figée.
  if (status !== "running" && status !== "failed" && status !== "awaiting_approval") return null;

  const category: InboxCategory =
    status === "failed" ? "failure" : status === "awaiting_approval" ? "needs_action" : "agent_activity";
  const preview =
    status === "failed"
      ? "Exécution interrompue"
      : status === "awaiting_approval"
        ? "Autorisation demandée par l’agent"
        : "Exécution en cours";
  const requirement: InboxRequirement | null =
    status === "awaiting_approval"
      ? { action: "approve_run" }
      : status === "failed"
        ? { action: "resume", source: "mission" }
        : null;

  return {
    conversationId: thread.id,
    href: `/runs/${thread.id}`,
    title: thread.title,
    context: thread.agentName,
    preview,
    categories: [category],
    category,
    isActionRequired: status === "awaiting_approval",
    latestActivityAt: thread.updatedAt,
    requirement,
  };
}

/**
 * L'ordre des items n'a plus d'importance ici : c'est `groupInboxSections`
 * qui range chaque item dans sa section, puis trie par ancienneté d'attente.
 */
export function buildInboxItems({
  tasks,
  missions,
}: {
  tasks: readonly GuidedInboxTaskSummary[];
  missions: readonly InboxMissionSummary[];
}): InboxItem[] {
  return [
    ...tasks.map(guidedTaskInboxItem),
    ...missions.map(missionInboxItem),
  ].filter((item): item is InboxItem => item !== null);
}

export type InboxSection = { id: string; title: string; items: InboxItem[] };

function byWaitingSinceAscending(left: InboxItem, right: InboxItem): number {
  return left.latestActivityAt.localeCompare(right.latestActivityAt);
}

/**
 * Range l'Inbox en quatre sections par nature, dans cet ordre : la décision
 * réclamée, la reprise après échec, les brouillons, puis ce qui avance sans
 * action disponible. Une section vide n'apparaît pas. À l'intérieur d'une section, le
 * blocage le plus ancien vient en premier : c'est l'ordre global par
 * priorité de catégorie qu'il remplace.
 *
 * Sans capacité pour décider ou relancer, les items concernés restent visibles
 * dans la section des activités.
 */
export function groupInboxSections(items: readonly InboxItem[], actor?: InboxActor): InboxSection[] {
  const decide: InboxItem[] = [];
  const resume: InboxItem[] = [];
  const drafts: InboxItem[] = [];
  const followUp: InboxItem[] = [];

  for (const item of items) {
    // Sans acteur, aucune restriction : c'est le cas du miroir mobile, qui
    // n'a pas d'authentification.
    const actionable = !actor || canActOn(item.requirement, actor);

    if (item.categories.includes("draft")) {
      if (actionable) drafts.push(item);
      else followUp.push(item);
    } else if (item.categories.includes("needs_action")) {
      if (actionable) decide.push(item);
      else {
        followUp.push(item);
      }
    } else if (item.categories.includes("failure")) {
      if (actionable) resume.push(item);
      else {
        followUp.push(item);
      }
    } else {
      followUp.push(item);
    }
  }

  const sections: InboxSection[] = [];
  if (decide.length > 0) {
    sections.push({
      id: "needs_action",
      title: "Décisions à traiter",
      items: [...decide].sort(byWaitingSinceAscending),
    });
  }
  if (resume.length > 0) {
    sections.push({ id: "failure", title: "À reprendre", items: [...resume].sort(byWaitingSinceAscending) });
  }
  if (drafts.length > 0) {
    sections.push({ id: "draft", title: "Brouillons à compléter", items: [...drafts].sort(byWaitingSinceAscending) });
  }
  if (followUp.length > 0) {
    sections.push({
      id: "in_progress",
      title: "Activités en cours",
      items: [...followUp].sort(byWaitingSinceAscending),
    });
  }
  return sections;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Au-delà de ce délai d'attente, une ligne de la section 1 passe en alerte. */
export const INBOX_OVERDUE_MS = DAY_MS;

function elapsedSince(iso: string, now: number | Date): number {
  const nowMs = now instanceof Date ? now.getTime() : now;
  return nowMs - new Date(iso).getTime();
}

/**
 * Âge d'une attente, en français, court : « à l'instant », « depuis 12 min »,
 * « depuis 3 h », « depuis 2 j ». `now` est un paramètre explicite, jamais
 * `Date.now()` à l'intérieur, pour rester testable.
 */
export function waitingSince(iso: string, now: number | Date): string {
  const elapsed = elapsedSince(iso, now);
  if (!Number.isFinite(elapsed) || elapsed < MINUTE_MS) return "à l’instant";
  if (elapsed < HOUR_MS) return `depuis ${Math.floor(elapsed / MINUTE_MS)} min`;
  if (elapsed < DAY_MS) return `depuis ${Math.floor(elapsed / HOUR_MS)} h`;
  return `depuis ${Math.floor(elapsed / DAY_MS)} j`;
}

/** Attente bloquée depuis plus de 24 h : déclenche le ton d'alerte de la section 1. */
export function isOverdueWait(iso: string, now: number | Date): boolean {
  const elapsed = elapsedSince(iso, now);
  return Number.isFinite(elapsed) && elapsed >= INBOX_OVERDUE_MS;
}
