import type { ConnectorTestStatus, ConnectorType } from "@/db/schema";

export const CONNECTOR_TYPES = ["gmail_imap", "outlook_imap", "pro_imap"] as const;

export type ConnectorPublicDto = {
  type: ConnectorType;
  label: string;
  email: string;
  imapHost: string;
  imapPort: number;
  passwordConfigured: boolean;
  lastTestStatus: ConnectorTestStatus;
  lastTestedAt: string | null;
  updatedAt: string;
};

export const CONNECTOR_PRESETS: Record<
  ConnectorType,
  { label: string; imapHost: string; imapPort: number }
> = {
  gmail_imap: { label: "Gmail (IMAP)", imapHost: "imap.gmail.com", imapPort: 993 },
  outlook_imap: { label: "Outlook (IMAP)", imapHost: "outlook.office365.com", imapPort: 993 },
  pro_imap: { label: "Email pro (IMAP)", imapHost: "", imapPort: 993 },
};
