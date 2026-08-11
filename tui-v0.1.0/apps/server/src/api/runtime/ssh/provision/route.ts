import { apiErrorResponse } from "@/modules/api/errors";
import { assertSameOriginMutation } from "@/modules/api/same-origin";
import {
  buildSshProvisionPlan,
  createProvisionJob,
  inspectSeparatedSshTargets,
  inspectSshTarget,
  provisionSshRuntime,
  type RuntimeSshProvisionInput,
} from "@/modules/runtime/ssh/provisioning";
import { parseProvisionInput } from "../provisioning-shared";

type JobStore = Map<string, ReturnType<typeof createProvisionJob>>;
const globalJobs = globalThis as typeof globalThis & { hermesConsoleSshJobs?: JobStore };
const jobs: JobStore = (globalJobs.hermesConsoleSshJobs ??= new Map());
let provisioningLock = false;
const JOB_TTL_MS = 15 * 60 * 1_000;
const MAX_JOBS = 100;

export function getSshProvisionJob(id: string) {
  pruneJobs();
  return jobs.get(id) ?? null;
}

function activeProvisionJob() {
  return [...jobs.values()].find((job) => job.status === "queued" || job.status === "running") ?? null;
}

export async function POST(request: Request) {
  try {
    pruneJobs();
    assertSameOriginMutation(request);
    const input = parseProvisionInput(await request.json());
    const active = activeProvisionJob();
    if (provisioningLock || active) {
      return Response.json(
        { error: { code: "SSH_PROVISION_BUSY", message: "Un provisioning SSH est déjà en cours.", job: active } },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    provisioningLock = true;
    const inspection = await inspectSshTarget(input.provisioner, input.remoteBaseUrl, input.remoteWorkdir);
    await inspectSeparatedSshTargets(input.provisioner, input.target);
    const plan = buildSshProvisionPlan(input, inspection);
    if (plan.blockers.length > 0) {
      provisioningLock = false;
      return Response.json(
        { error: { code: "SSH_PROVISION_BLOCKED", message: plan.blockers.join(" ") }, inspection, plan },
        { status: 409 },
      );
    }
    if (input.confirmation !== plan.confirmation) {
      provisioningLock = false;
      return Response.json(
        {
          error: {
            code: "SSH_PROVISION_CONFIRMATION_REQUIRED",
            message: `Confirmez explicitement la cible ${plan.confirmation} affichée dans le plan.`,
          },
          inspection,
          plan,
        },
        { status: 409 },
      );
    }

    const job = createProvisionJob(input.mode);
    jobs.set(job.id, job);
    void runJob(job.id, input).finally(() => {
      provisioningLock = false;
    });
    return Response.json({ job }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    provisioningLock = false;
    return apiErrorResponse(error);
  }
}

function pruneJobs(now = Date.now()) {
  for (const [id, job] of jobs) {
    if (
      job.status !== "queued" &&
      job.status !== "running" &&
      now - Date.parse(job.updatedAt) > JOB_TTL_MS
    ) {
      jobs.delete(id);
    }
  }
  if (jobs.size <= MAX_JOBS) return;
  const removable = [...jobs.values()]
    .filter((job) => job.status !== "queued" && job.status !== "running")
    .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt));
  for (const job of removable) {
    if (jobs.size <= MAX_JOBS) break;
    jobs.delete(job.id);
  }
}

async function runJob(id: string, input: RuntimeSshProvisionInput) {
  const job = jobs.get(id);
  if (!job) return;
  job.status = "running";
  job.updatedAt = new Date().toISOString();
  try {
    const result = await provisionSshRuntime(input, (update) => {
      job.step = update.step;
      job.progress = update.progress;
      job.message = update.message;
      job.updatedAt = new Date().toISOString();
    });
    job.status = "succeeded";
    job.progress = 100;
    job.message = "Hermes distant est connecté et vérifié.";
    job.runtime = result.runtime;
    job.updatedAt = new Date().toISOString();
  } catch (error) {
    job.status = "failed";
    job.progress = Math.min(job.progress, 99);
    job.message = "Le provisioning a échoué.";
    job.error = {
      code: error instanceof Error && "code" in error ? String((error as { code?: unknown }).code) : "SSH_PROVISION_FAILED",
      message: error instanceof Error ? error.message : "Opération SSH impossible.",
    };
    job.updatedAt = new Date().toISOString();
  }
}
