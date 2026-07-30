/**
 * Mentions `@agent` — le seul point d'entrée pour appeler un agent Hermes.
 *
 * Un agent ne tourne **jamais** dans une session `/chat` : une mention est
 * interceptée avant l'envoi et redirigée vers une mission `/runs`. Le texte qui
 * suit la mention devient l'instruction envoyée à cet agent.
 */

export type ParsedAgentMention = {
  /** Slug, nom ou id de l'agent, tel que saisi. */
  ref: string;
  /** Instruction qui suit la mention. Peut être vide (l'appelant refuse alors). */
  prompt: string;
};

/** Mention en tête de message uniquement — `merci @agent` reste du texte. */
const MENTION_PATTERN = /^@([A-Za-z0-9][A-Za-z0-9._-]*)(?:\s+([\s\S]*))?$/;

/** Token `@…` en cours de frappe, repéré sous le curseur pour l'autocomplétion. */
export type MentionQuery = {
  /** Index du `@` dans le texte. */
  start: number;
  /** Index de fin (exclu) du token. */
  end: number;
  /** Ce qui suit le `@`, éventuellement vide. */
  query: string;
};

const QUERY_PATTERN = /@([A-Za-z0-9._-]*)$/;

/**
 * Repère le token `@…` que le curseur est en train d'écrire, pour alimenter le
 * popup d'agents. Contrairement à `parseAgentMention`, la position dans le
 * message n'est pas contrainte : le `@` doit seulement ouvrir un mot.
 */
export function findMentionQuery(text: string, caret: number): MentionQuery | null {
  const before = text.slice(0, caret);
  const match = QUERY_PATTERN.exec(before);
  if (!match) return null;

  const start = caret - match[0].length;
  const previous = start > 0 ? text[start - 1] : "";
  if (previous && !/\s/.test(previous)) return null;

  // Le curseur peut être au milieu du token : la sélection remplace tout le mot.
  let end = caret;
  while (end < text.length && /[A-Za-z0-9._-]/.test(text[end])) end += 1;

  return { start, end, query: match[1] };
}

export function parseAgentMention(raw: string): ParsedAgentMention | null {
  const match = MENTION_PATTERN.exec(raw.trim());
  if (!match) return null;
  return { ref: match[1], prompt: (match[2] ?? "").trim() };
}

/**
 * Vrai dès que le message ouvre sur une mention, prompt vide compris : une
 * mention ne doit jamais retomber silencieusement dans le chat libre.
 */
export function isAgentMentionMessage(raw: string): boolean {
  return parseAgentMention(raw) !== null;
}
