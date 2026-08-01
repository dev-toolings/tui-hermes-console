import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";
import { restoreLifecycleExportToScratch } from "@/modules/retention/restore";

const [bundlePath, expectedSha256, databaseUrl, artifactRoot, targetSiteId] = process.argv.slice(2);

if (!bundlePath || !expectedSha256 || !databaseUrl || !artifactRoot || !targetSiteId) {
  console.error(
    "Usage: bun apps/server/scripts/restore-lifecycle-scratch.ts <bundle.json> <sha256> <scratch-database-url> <scratch-artifact-root> <target-site-id>",
  );
  process.exit(2);
}

const client = postgres(databaseUrl, { max: 1, prepare: false });
const database = drizzle(client, { schema });

try {
  const result = await restoreLifecycleExportToScratch(
    await readFile(bundlePath),
    expectedSha256,
    { database, artifactRoot, targetSiteId },
  );
  console.log(JSON.stringify({ status: "PASS", ...result }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "LIFECYCLE_RESTORE_FAILED");
  process.exitCode = 1;
} finally {
  await client.end({ timeout: 0 });
}
