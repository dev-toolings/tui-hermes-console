import { sql } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { agents, messages, runEvents, runtimeConfig, threads } from "@/db/schema";

export type StorageStats = {
  agents: number;
  threads: number;
  messages: number;
  events: number;
  runtimeConfigured: boolean;
};

export async function getStorageStats(): Promise<StorageStats> {
  try {
    const db = getDatabase();
    const [[agentCount], [threadCount], [messageCount], [eventCount], [runtimeRow]] =
      await Promise.all([
        db.select({ count: sql<number>`count(*)::int` }).from(agents),
        db.select({ count: sql<number>`count(*)::int` }).from(threads),
        db.select({ count: sql<number>`count(*)::int` }).from(messages),
        db.select({ count: sql<number>`count(*)::int` }).from(runEvents),
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

export function formatBytes(bytes: number) {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} Mo`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${bytes} o`;
}

export function getFileLimits() {
  const maxFile = Number(process.env.MAX_FILE_SIZE_BYTES ?? 20_971_520);
  const maxTotal = Number(process.env.MAX_RUN_FILES_TOTAL_BYTES ?? 104_857_600);
  const maxCount = Number(process.env.MAX_RUN_FILE_COUNT ?? 20);
  return { maxFile, maxTotal, maxCount };
}
