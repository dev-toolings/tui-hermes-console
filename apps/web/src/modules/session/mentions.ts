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
