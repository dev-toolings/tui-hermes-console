import { crawlGithubHermesReleases } from "@/modules/updates/github-hermes-releases";
import { upsertHermesReleases } from "@/modules/updates/hermes-releases";

const startedAt = Date.now();

try {
  const releases = await crawlGithubHermesReleases();
  const upserted = await upsertHermesReleases(releases);
  console.log(JSON.stringify({ ok: true, upserted, durationMs: Date.now() - startedAt, syncedAt: new Date().toISOString() }));
  process.exit(0);
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error), durationMs: Date.now() - startedAt }));
  process.exit(1);
}
