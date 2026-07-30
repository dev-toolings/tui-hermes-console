import type { ConnectorType } from "@/db/schema";

/**
 * Intention d'accéder à une boîte mail.
 *
 * Le simple mot « email » ne suffit pas : un agent de prospection qui écrit
 * « n'invente jamais un email » n'a besoin d'aucun connecteur, et se voir
 * réclamer Gmail (IMAP) envoie l'utilisateur configurer un secret pour rien.
 * Ce qu'on cherche, c'est la LECTURE d'une boîte.
 */
const MAILBOX_INTENT =
  /\bimap\b|bo[iî]te (?:mail|aux lettres|de r[ée]ception)|inbox|triage|himalaya|(?:lire|lis|consulte|relève|relever|dépouille|scanne)[^.]{0,40}\b(?:mails?|e-?mails?|messages?|courriels?)\b/;

const GMAIL = /\bgmail\b|\bgoogle\b/;
const OUTLOOK = /\boutlook\b|\boffice ?365\b|\bmicrosoft\b/;

/** Connecteurs requis pour un agent donné (heuristique v1). */
export function getRequiredConnectors(input: {
  slug: string;
  name: string;
  instructions: string;
}): ConnectorType[] {
  const haystack = `${input.slug} ${input.name} ${input.instructions}`.toLowerCase();
  const required = new Set<ConnectorType>();

  if (!MAILBOX_INTENT.test(haystack)) return [];

  if (GMAIL.test(haystack)) required.add("gmail_imap");
  if (OUTLOOK.test(haystack)) required.add("outlook_imap");

  // Boîte mail demandée sans fournisseur nommé : Gmail reste le défaut, mais
  // c'est bien l'intention qui déclenche, pas le vocabulaire.
  if (required.size === 0) required.add("gmail_imap");

  return [...required];
}

export const CONNECTOR_TYPE_LABELS: Record<ConnectorType, string> = {
  gmail_imap: "Gmail (IMAP)",
  outlook_imap: "Outlook (IMAP)",
  pro_imap: "Email pro (IMAP)",
};
