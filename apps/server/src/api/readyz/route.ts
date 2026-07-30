import { getDatabase } from "@/db/client";
import { runs } from "@/db/schema";
import { getRuntimePublic } from "@/modules/runtime/config";

export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  try {
    await getDatabase().select({ id: runs.id }).from(runs).limit(1);
    checks.postgres = { ok: true };
  } catch (error) {
    checks.postgres = {
      ok: false,
      detail: error instanceof Error ? error.message : "unreachable",
    };
  }

  try {
    const runtimePublic = await getRuntimePublic();
    checks.runtimeConfig = {
      ok: runtimePublic.configured,
      detail: runtimePublic.configured
        ? `${runtimePublic.source}:${runtimePublic.baseUrl}`
        : "missing",
    };
  } catch (error) {
    checks.runtimeConfig = {
      ok: false,
      detail: error instanceof Error ? error.message : "error",
    };
  }

  const workdir = process.env.HERMES_SHARED_WORKDIR?.trim();
  if (workdir) {
    try {
      const { access, constants } = await import("node:fs/promises");
      await access(workdir, constants.R_OK | constants.W_OK);
      checks.sharedWorkdir = { ok: true, detail: workdir };
    } catch {
      checks.sharedWorkdir = { ok: false, detail: workdir };
    }
  } else {
    checks.sharedWorkdir = { ok: true, detail: "not_configured" };
  }

  const ok = Object.values(checks).every((check) => check.ok);
  return Response.json({ ok, checks }, { status: ok ? 200 : 503 });
}
