import { eq, sql } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { agents, messages, runEvents, runs, runtimeConfig, threads } from "@/db/schema";
import type { SiteScope } from "@/modules/auth/service";

export type { StorageStats } from "@console/core/types/api";
import type { StorageStats } from "@console/core/types/api";

export async function getStorageStats(scope: SiteScope): Promise<StorageStats> {
  try {
    const db = getDatabase();
    const [[agentCount], [threadCount], [messageCount], [eventCount], [runtimeRow]] =
      await Promise.all([
        db.select({ count: sql<number>`count(*)::int` }).from(agents).where(eq(agents.siteId, scope.siteId)),
        db.select({ count: sql<number>`count(*)::int` }).from(threads).where(eq(threads.siteId, scope.siteId)),
        db.select({ count: sql<number>`count(*)::int` }).from(messages).innerJoin(threads, eq(messages.threadId, threads.id)).where(eq(threads.siteId, scope.siteId)),
        db.select({ count: sql<number>`count(*)::int` }).from(runEvents).innerJoin(runs, eq(runEvents.runId, runs.id)).where(eq(runs.siteId, scope.siteId)),
        db.select({ id: runtimeConfig.id }).from(runtimeConfig).limit(1),
      ]);

    return {
      agents: agentCount?.count ?? 0,
      threads: threadCount?.count ?? 0,
      messages: messageCount?.count ?? 0,
      events: eventCount?.count ?? 0,
      runtimeConfigured: Boolean(runtimeRow),
    };
  } catch {
    return {
      agents: 0,
      threads: 0,
      messages: 0,
      events: 0,
      runtimeConfigured: false,
    };
  }
}

export { formatBytes } from "@console/core/lib/format-bytes";

export function getFileLimits() {
  const maxFile = Number(process.env.MAX_FILE_SIZE_BYTES ?? 20_971_520);
  const maxTotal = Number(process.env.MAX_RUN_FILES_TOTAL_BYTES ?? 104_857_600);
  const maxCount = Number(process.env.MAX_RUN_FILE_COUNT ?? 20);
  return { maxFile, maxTotal, maxCount };
}
