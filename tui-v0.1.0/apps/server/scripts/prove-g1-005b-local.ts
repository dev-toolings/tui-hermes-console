import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dir, "../../..");
const docker = spawnSync("docker", ["info"], { cwd: repositoryRoot, stdio: "ignore" });
if (docker.status !== 0) {
  console.error("G1-005B P-INT NON EXÉCUTÉ : Docker est requis pour PostgreSQL scratch.");
  process.exit(2);
}

const result = spawnSync(
  "bun",
  ["test", "apps/server/drizzle/audit-export.integration.test.ts", "--max-concurrency=1"],
  { cwd: repositoryRoot, stdio: "inherit" },
);
process.exit(result.status ?? 1);
