/**
 * Tout ce que l'écran doit savoir d'une demande d'autorisation, en fonctions
 * pures.
 *
 * Le runtime envoie deux choses : une liste de `choices` (`once`, `session`,
 * `always`, `deny`) et une `description` en texte libre produite par son scanner
 * de sécurité. La liste, on la traduit ; la description, on la découpe — mais
 * sans jamais prétendre y trouver une structure qui n'existe pas côté Hermes.
 * Toute règle qui décide de ce qui s'affiche ou de ce qui est cliquable vit ici,
 * pas dans le composant : c'est ce qui la rend testable sans monter React.
 */
import {
  APPROVAL_CHOICES,
  type ApprovalChoice,
} from "@console/core/lib/thread-snapshot-mutations";
import type { RunStatus } from "@console/core/lib/run-status";

export type ApprovalSeverity = "HIGH" | "MEDIUM" | "LOW";

export type ApprovalScan = {
  /** `[HIGH]` & co. quand le scanner en met un — jamais deviné. */
  severity: ApprovalSeverity | null;
  /** La nature du risque, en une ligne : « Pipe to interpreter: curl | python3 ». */
  title: string | null;
  /** L'explication complète, sans le titre ni les alternatives. */
  detail: string | null;
  /** Les commandes de remplacement que le runtime suggère après « Safer: ». */
  safer: string[];
};

const EMPTY_SCAN: ApprovalScan = {
  severity: null,
  title: null,
  detail: null,
  safer: [],
};

/** `Security scan — `, `Security scan: ` … le préfixe ne porte aucune information. */
const SCAN_PREFIX = /^\s*security scan\s*[—:-]\s*/i;
const SEVERITY = /^\[(HIGH|MEDIUM|LOW)\]\s*/i;
/** Le bloc d'alternatives commence à « Safer: » et court jusqu'à la fin. */
const SAFER = /\bSafer\s*:/i;
/** « — or: », « - or: » : le runtime sépare ainsi ses suggestions. */
const SAFER_SEPARATOR = /\s*[—-]\s*or\s*:\s*/i;

function squash(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Découpe la description du scanner en badge / titre / détail / alternatives.
 *
 * C'est une heuristique, et elle est écrite comme telle : Hermes ne publie pas
 * ces champs séparément (§18.1). Rien n'est obligatoire — une description qui ne
 * suit aucun de ces motifs ressort entière dans `detail`, ce qui est exactement
 * l'affichage d'aujourd'hui.
 */
export function parseApprovalScan(description: string | null | undefined): ApprovalScan {
  if (!description || !description.trim()) return EMPTY_SCAN;

  const saferIndex = description.search(SAFER);
  const head = saferIndex === -1 ? description : description.slice(0, saferIndex);
  const saferBlock =
    saferIndex === -1 ? "" : description.slice(saferIndex).replace(SAFER, "");

  let rest = squash(head).replace(SCAN_PREFIX, "");

  const severityMatch = rest.match(SEVERITY);
  const severity = severityMatch
    ? (severityMatch[1]!.toUpperCase() as ApprovalSeverity)
    : null;
  if (severityMatch) rest = rest.slice(severityMatch[0].length);

  // « Pipe to interpreter: curl | python3: Command pipes output… » — le dernier
  // segment est la phrase d'explication, ce qui précède nomme le risque. Les
  // URLs (`https://…`) ne sont pas coupées : le séparateur exige une espace.
  const segments = rest.split(/:\s+/);
  const detailSegment = segments.length > 1 ? segments.pop()! : null;
  const title = detailSegment ? squash(segments.join(": ")) : null;
  const detail = squash(detailSegment ?? rest);

  const safer = saferBlock
    .split(SAFER_SEPARATOR)
    .map(squash)
    .filter((item) => item.length > 0);

  return {
    severity,
    title: title || null,
    detail: detail || null,
    safer,
  };
}

/**
 * Ordre canonique des choix : refuser d'abord, puis les autorisations de la plus
 * étroite à la plus large. Un utilisateur qui parcourt les boutons de gauche à
 * droite va donc du moins engageant au plus engageant.
 */
const CHOICE_ORDER: readonly ApprovalChoice[] = ["deny", "once", "session", "always"];

/** Ce qu'on affiche quand le runtime n'énumère rien : les deux réponses sûres. */
const FALLBACK_CHOICES: readonly ApprovalChoice[] = ["deny", "once"];

function isApprovalChoice(value: string): value is ApprovalChoice {
  return (APPROVAL_CHOICES as readonly string[]).includes(value);
}

/**
 * Ne garde que les choix qu'Hermes accepte, dans l'ordre canonique. Afficher un
 * bouton que le runtime refuserait serait un mensonge — et un 400.
 */
export function orderApprovalChoices(choices: readonly string[] | null | undefined) {
  const offered = new Set((choices ?? []).filter(isApprovalChoice));
  const ordered = CHOICE_ORDER.filter((choice) => offered.has(choice));
  return ordered.length > 0 ? ordered : [...FALLBACK_CHOICES];
}

const CHOICE_LABELS: Record<ApprovalChoice, string> = {
  once: "Autoriser une fois",
  session: "Autoriser pour la session",
  always: "Toujours autoriser",
  deny: "Refuser",
};

const DECISION_LABELS: Record<ApprovalChoice, string> = {
  once: "Autorisé une fois",
  session: "Autorisé pour la session",
  always: "Toujours autorisé",
  deny: "Refusé",
};

/** Libellé du bouton, à l'infinitif : c'est une action à faire. */
export function approvalChoiceLabel(choice: ApprovalChoice) {
  return CHOICE_LABELS[choice];
}

/** Libellé de la trace, au participe : c'est une décision déjà prise. */
export function approvalDecisionLabel(choice: ApprovalChoice) {
  return DECISION_LABELS[choice];
}

/** Le chiffre qui déclenche ce choix. Au-delà de neuf, plus de raccourci. */
export function approvalChoiceShortcut(index: number) {
  return index >= 0 && index < 9 ? String(index + 1) : null;
}

/**
 * Un seul choix engage au-delà de la mission en cours : il mérite un second
 * geste. `once` et `deny` ne survivent pas à la commande, `session` meurt avec
 * la session Hermes.
 */
export function requiresConfirmation(choice: ApprovalChoice) {
  return choice === "always";
}

/**
 * Répondre n'a de sens qu'une fois, sur une mission qui attend vraiment, avec un
 * runtime joignable. Sans cette porte, un double-clic envoie un second POST que
 * le serveur rejette en `RUN_NOT_AWAITING_APPROVAL` — une erreur rouge pour une
 * décision pourtant bien partie.
 */
export function canRespondToApproval(input: {
  sending: boolean;
  connected: boolean;
  status: RunStatus | null;
}) {
  return !input.sending && input.connected && input.status === "awaiting_approval";
}
