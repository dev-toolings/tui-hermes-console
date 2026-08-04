import { and, desc, eq } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { hermesReleases } from "@/db/schema";

export type HermesRelease = {
  id: number;
  tagName: string;
  name: string | null;
  body: string;
  htmlUrl: string;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
  prerelease: boolean;
  draft: boolean;
  noteCount: number;
  featureCount: number;
  improvementCount: number;
  suppressionCount: number;
  syncedAt: string;
};

export type HermesReleaseWrite = Omit<HermesRelease, "syncedAt">;

export type HermesReleaseResult = {
  releases: HermesRelease[];
  fetchedAt: string;
};

function compactReleaseBody(body: string, htmlUrl: string): string {
  const lines = body.split("\n");
  const kept: string[] = [];
  let contentLines = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^#{1,6}\s+/.test(trimmed) || contentLines < 18) {
      kept.push(line);
      if (!/^#{1,6}\s+/.test(trimmed)) contentLines += 1;
    }
    if (contentLines >= 18) break;
  }

  if (kept.length === lines.filter((line) => line.trim()).length) return body;
  return `${kept.join("\n\n")}\n\n[Consulter le changelog complet sur GitHub](${htmlUrl})`;
}

function toRelease(row: typeof hermesReleases.$inferSelect, compactBody = false): HermesRelease {
  return {
    id: row.id,
    tagName: row.tagName,
    name: row.name,
    body: compactBody ? compactReleaseBody(row.body, row.htmlUrl) : row.body,
    htmlUrl: row.htmlUrl,
    publishedAt: row.publishedAt.toISOString(),
    createdAt: row.sourceCreatedAt.toISOString(),
    updatedAt: row.sourceUpdatedAt.toISOString(),
    prerelease: row.prerelease,
    draft: row.draft,
    noteCount: row.noteCount,
    featureCount: row.featureCount,
    improvementCount: row.improvementCount,
    suppressionCount: row.suppressionCount,
    syncedAt: row.syncedAt.toISOString(),
  };
}

export async function getHermesReleases(limit = 20, includePrereleases = false): Promise<HermesReleaseResult> {
  const database = getDatabase();
  const rows = await database
    .select()
    .from(hermesReleases)
    .where(
      includePrereleases
        ? eq(hermesReleases.draft, false)
        : and(eq(hermesReleases.draft, false), eq(hermesReleases.prerelease, false)),
    )
    .orderBy(desc(hermesReleases.publishedAt))
    .limit(Math.min(Math.max(limit, 1), 100));

  return {
    releases: rows.map((row) => toRelease(row, true)),
    fetchedAt: rows[0]?.syncedAt.toISOString() ?? new Date().toISOString(),
  };
}

export async function getHermesRelease(id: number): Promise<HermesRelease | null> {
  const database = getDatabase();
  const [row] = await database.select().from(hermesReleases).where(eq(hermesReleases.id, id)).limit(1);
  return row ? toRelease(row) : null;
}

export async function upsertHermesReleases(releases: HermesReleaseWrite[]): Promise<number> {
  if (releases.length === 0) return 0;

  const database = getDatabase();
  const syncedAt = new Date();

  for (const release of releases) {
    const values: typeof hermesReleases.$inferInsert = {
      id: release.id,
      tagName: release.tagName,
      name: release.name,
      body: release.body,
      htmlUrl: release.htmlUrl,
      publishedAt: new Date(release.publishedAt),
      sourceCreatedAt: new Date(release.createdAt),
      sourceUpdatedAt: new Date(release.updatedAt),
      prerelease: release.prerelease,
      draft: release.draft,
      noteCount: release.noteCount,
      featureCount: release.featureCount,
      improvementCount: release.improvementCount,
      suppressionCount: release.suppressionCount,
      syncedAt,
    };

    await database
      .insert(hermesReleases)
      .values(values)
      .onConflictDoUpdate({
        target: hermesReleases.id,
        set: {
          tagName: values.tagName,
          name: values.name,
          body: values.body,
          htmlUrl: values.htmlUrl,
          publishedAt: values.publishedAt,
          sourceCreatedAt: values.sourceCreatedAt,
          sourceUpdatedAt: values.sourceUpdatedAt,
          prerelease: values.prerelease,
          draft: values.draft,
          noteCount: values.noteCount,
          featureCount: values.featureCount,
          improvementCount: values.improvementCount,
          suppressionCount: values.suppressionCount,
          syncedAt,
        },
      });
  }

  return releases.length;
}
