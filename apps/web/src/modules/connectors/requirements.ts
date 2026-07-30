import type { ConnectorType } from "@/db/schema";

/** Connecteurs requis pour un agent donné (heuristique v1). */
export function getRequiredConnectors(input: {
  slug: string;
  name: string;
  instructions: string;
}): ConnectorType[] {
  const haystack = `${input.slug} ${input.name} ${input.instructions}`.toLowerCase();
  const required = new Set<ConnectorType>();

  if (
    /email|mail|imap|gmail|himalaya|triage|bo[iî]te/.test(haystack) &&
    /gmail|google/.test(haystack)
  ) {
    required.add("gmail_imap");
  }
  if (/email|mail|imap|outlook|office365|microsoft/.test(haystack) && /outlook|office365|microsoft/.test(haystack)) {
    required.add("outlook_imap");
  }
  if (/email|mail|imap|himalaya|triage/.test(haystack)) {
    required.add("gmail_imap");
  }

  return [...required];
}

export const CONNECTOR_TYPE_LABELS: Record<ConnectorType, string> = {
  gmail_imap: "Gmail (IMAP)",
  outlook_imap: "Outlook (IMAP)",
  pro_imap: "Email pro (IMAP)",
};
