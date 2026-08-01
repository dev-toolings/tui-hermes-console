import { readFile } from "node:fs/promises";
import { verifyLifecycleExport } from "@/modules/retention/verify-export";

const filePath = process.argv[2];
const expectedSha256 = process.argv[3];

if (!filePath) {
  console.error("Usage: bun apps/server/scripts/verify-lifecycle-export.ts <bundle.json> [sha256]");
  process.exit(2);
}

try {
  const bytes = await readFile(filePath);
  console.log(JSON.stringify(verifyLifecycleExport(bytes, expectedSha256)));
} catch (error) {
  console.error(error instanceof Error ? error.message : "LIFECYCLE_EXPORT_VERIFY_FAILED");
  process.exit(1);
}
