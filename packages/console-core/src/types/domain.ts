/**
 * Types du domaine, extraits du schéma Drizzle.
 *
 * Ils décrivent la forme des données, pas leur stockage : l'UI et le serveur
 * en ont tous les deux besoin, alors que seul le serveur doit connaître
 * `drizzle-orm`. Les garder ici évite que le SPA tire le schéma — et avec lui
 * le driver Postgres — dans son bundle.
 *
 * `apps/server/src/db/schema.ts` les ré-exporte, pour que le code serveur
 * continue de les importer depuis le schéma comme avant.
 */

export type MessageContent = Array<
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | {
      type: "tool-call";
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
      result?: unknown;
    }
>;

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type RuntimeHealthStatus =
  | "unknown"
  | "healthy"
  | "unreachable"
  | "unauthorized"
  | "missing_feature";

/** `direct` = la Console appelle baseUrl telle quelle. `ssh` = via un tunnel SSH sortant. */
export type RuntimeTransport = "direct" | "ssh";

/** `agent` = binaire `ssh` + ~/.ssh/config (clé, agent, ProxyJump).
 *  `password` = ssh2 avec un mot de passe stocké chiffré. */
export type RuntimeSshAuth = "agent" | "password";

/** État du volume d'échange requis par un runtime distant. */
export type RuntimeWorkspaceStatus =
  | "not_required"
  | "required"
  | "verification_required"
  | "ready";

export type ConnectorType = "gmail_imap" | "outlook_imap" | "pro_imap";
export type ConnectorTestStatus = "unknown" | "healthy" | "failed";
export type ThreadSource = "chat" | "mission";

export type ArtifactDirection = "input" | "output";
