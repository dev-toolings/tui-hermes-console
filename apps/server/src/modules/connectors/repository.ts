import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { connectors, type ConnectorTestStatus, type ConnectorType } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { ImapTestError, testImapLogin } from "./imap-test";
import { CONNECTOR_PRESETS, type ConnectorPublicDto } from "@console/core/modules/connectors/types";

export class ConnectorRepositoryError extends Error {
  constructor(
    readonly code: "CONNECTOR_NOT_FOUND" | "CONNECTOR_INVALID_TYPE",
    message: string,
  ) {
    super(message);
    this.name = "ConnectorRepositoryError";
  }
}

export function isConnectorType(value: string): value is ConnectorType {
  return value === "gmail_imap" || value === "outlook_imap" || value === "pro_imap";
}

export async function listConnectors(): Promise<ConnectorPublicDto[]> {
  const rows = await getDatabase().select().from(connectors);
  return rows.map(toPublicDto);
}

export async function getConnector(type: ConnectorType): Promise<ConnectorPublicDto | null> {
  const [row] = await getDatabase().select().from(connectors).where(eq(connectors.type, type)).limit(1);
  return row ? toPublicDto(row) : null;
}

export async function isConnectorConfigured(type: ConnectorType): Promise<boolean> {
  const connector = await getConnector(type);
  return Boolean(connector?.passwordConfigured);
}

export async function saveConnector(input: {
  type: ConnectorType;
  label?: string;
  email: string;
  imapHost?: string;
  imapPort?: number;
  password?: string;
}): Promise<ConnectorPublicDto> {
  const preset = CONNECTOR_PRESETS[input.type];
  const db = getDatabase();
  const now = new Date();
  const [existing] = await db.select().from(connectors).where(eq(connectors.type, input.type)).limit(1);

  const imapHost = input.imapHost?.trim() || preset.imapHost;
  if (!imapHost) {
    throw new ConnectorRepositoryError(
      "CONNECTOR_INVALID_TYPE",
      "Le serveur IMAP est requis pour ce connecteur.",
    );
  }

  const values = {
    label: input.label?.trim() || preset.label,
    email: input.email.trim(),
    imapHost,
    imapPort: input.imapPort ?? preset.imapPort,
    updatedAt: now,
  };

  if (existing) {
    await db
      .update(connectors)
      .set({
        ...values,
        ...(input.password?.trim()
          ? { encryptedPassword: encryptSecret(input.password.trim()) }
          : {}),
      })
      .where(eq(connectors.id, existing.id));
    return (await getConnector(input.type))!;
  }

  if (!input.password?.trim()) {
    throw new ConnectorRepositoryError(
      "CONNECTOR_INVALID_TYPE",
      "Le mot de passe est requis pour créer ce connecteur.",
    );
  }

  const id = `conn_${randomUUID().replaceAll("-", "")}`;
  await db.insert(connectors).values({
    id,
    type: input.type,
    ...values,
    encryptedPassword: encryptSecret(input.password.trim()),
    lastTestStatus: "unknown",
    createdAt: now,
  });

  return (await getConnector(input.type))!;
}

export async function deleteConnector(type: ConnectorType): Promise<void> {
  const db = getDatabase();
  const [existing] = await db.select({ id: connectors.id }).from(connectors).where(eq(connectors.type, type)).limit(1);
  if (!existing) {
    throw new ConnectorRepositoryError("CONNECTOR_NOT_FOUND", "Connecteur introuvable.");
  }
  await db.delete(connectors).where(eq(connectors.id, existing.id));
}

export async function testConnector(type: ConnectorType): Promise<ConnectorPublicDto> {
  const db = getDatabase();
  const [row] = await db.select().from(connectors).where(eq(connectors.type, type)).limit(1);
  if (!row) {
    throw new ConnectorRepositoryError("CONNECTOR_NOT_FOUND", "Connecteur introuvable.");
  }

  const password = decryptSecret(row.encryptedPassword);
  const now = new Date();
  let status: ConnectorTestStatus = "healthy";

  try {
    await testImapLogin({
      host: row.imapHost,
      port: row.imapPort,
      email: row.email,
      password,
    });
  } catch (error) {
    status = "failed";
    if (error instanceof ImapTestError) {
      await db
        .update(connectors)
        .set({ lastTestStatus: status, lastTestedAt: now, updatedAt: now })
        .where(eq(connectors.id, row.id));
      throw error;
    }
    throw error;
  }

  await db
    .update(connectors)
    .set({ lastTestStatus: status, lastTestedAt: now, updatedAt: now })
    .where(eq(connectors.id, row.id));

  return (await getConnector(type))!;
}

function toPublicDto(row: typeof connectors.$inferSelect): ConnectorPublicDto {
  return {
    type: row.type as ConnectorType,
    label: row.label,
    email: row.email,
    imapHost: row.imapHost,
    imapPort: row.imapPort,
    passwordConfigured: Boolean(row.encryptedPassword),
    lastTestStatus: row.lastTestStatus as ConnectorTestStatus,
    lastTestedAt: row.lastTestedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}
