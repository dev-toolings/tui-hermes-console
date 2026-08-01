import { desc, eq } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { auditLedgerEntries } from "@/db/schema";
import { assertSiteAction } from "@/modules/auth/site-authorization";
import type { SiteRequestContext } from "@/modules/auth/service";

export async function listSiteAuditEntries(
  context: SiteRequestContext,
  limit: number,
) {
  await assertSiteAction(context, "audit.read");
  const rows = await getDatabase()
    .select()
    .from(auditLedgerEntries)
    .where(eq(auditLedgerEntries.targetSiteId, context.siteId))
    .orderBy(desc(auditLedgerEntries.sequence))
    .limit(limit);

  return rows.map((row) => ({
    ...row,
    occurredAt: row.occurredAt.toISOString(),
    recordedAt: row.recordedAt.toISOString(),
  }));
}
