import { and, desc, eq, inArray } from "drizzle-orm";
import type {
  HermesRuntimeUpdateOperationDto,
  HermesRuntimeUpdateOperationPhase,
  HermesRuntimeUpdateOperationStatus,
} from "@console/core/types/api";

import { getDatabase } from "@/db/client";
import { runtimeUpdateOperations } from "@/db/schema";
import { HermesRuntimeError } from "./hermes-adapter";
import { getRuntimePublic } from "./config";
import { applyRuntimeUpdate, getRuntimeUpdatePlan } from "./update";

const ACTIVE_STATUSES: HermesRuntimeUpdateOperationStatus[] = ["queued", "running", "recovery_required"];
const TERMINAL_STATUSES: HermesRuntimeUpdateOperationStatus[] = ["succeeded", "rolled_back", "failed", "recovery_required"];
const runners = new Map<string, Promise<void>>();

type StartInput = {
  expectedConfigRevision: number | null;
  targetTag: string;
  trigger: "manual" | "automatic";
};

export async function startRuntimeUpdateOperation(input: StartInput) {
  const active = await activeRow();
  if (active) {
    if (active.targetTag === input.targetTag) return operationDto(active);
    throw new HermesRuntimeError("Une autre mise à jour Hermes est déjà active.", 409, "HERMES_UPDATE_BUSY");
  }

  const [plan, runtime] = await Promise.all([getRuntimeUpdatePlan(), getRuntimePublic()]);
  if (!plan.available || !plan.supported) {
    throw new HermesRuntimeError(plan.reason ?? "Cette mise à jour Hermes n’est pas applicable.", 409, "HERMES_UPDATE_UNSUPPORTED");
  }
  if (plan.latestTag !== input.targetTag || runtime.configRevision !== input.expectedConfigRevision) {
    throw new HermesRuntimeError("Le runtime ou la version cible a changé. Rechargez le plan de mise à jour.", 409, "HERMES_UPDATE_PLAN_STALE");
  }

  const id = `upd_${crypto.randomUUID().replaceAll("-", "")}`;
  const database = getDatabase();
  const [row] = await database
    .insert(runtimeUpdateOperations)
    .values({
      id,
      trigger: input.trigger,
      status: "queued",
      phase: "preflight",
      progress: 0,
      message: "Mise à jour en attente de démarrage.",
      method: plan.method,
      expectedRevision: input.expectedConfigRevision,
      previousVersion: plan.currentVersion,
      targetVersion: plan.latestVersion,
      targetTag: plan.latestTag,
    })
    .returning();
  if (!row) throw new Error("La mise à jour Hermes n’a pas pu être journalisée.");

  const runner = executeOperation(id).finally(() => runners.delete(id));
  runners.set(id, runner);
  void runner;
  return operationDto(row);
}

export async function getRuntimeUpdateOperation(id: string) {
  const database = getDatabase();
  const [row] = await database.select().from(runtimeUpdateOperations).where(eq(runtimeUpdateOperations.id, id)).limit(1);
  return row ? operationDto(row) : null;
}

export async function getActiveRuntimeUpdateOperation() {
  const row = await activeRow();
  if (!row) return null;
  if (
    row.status === "recovery_required" ||
    ((row.status === "queued" || row.status === "running") && !runners.has(row.id))
  ) {
    return reconcileInterrupted(row);
  }
  return operationDto(row);
}

export function isTerminalRuntimeUpdateStatus(status: HermesRuntimeUpdateOperationStatus) {
  return TERMINAL_STATUSES.includes(status);
}

export async function assertNoBlockingRuntimeUpdate() {
  const operation = await getActiveRuntimeUpdateOperation();
  if (!operation) return;
  throw new HermesRuntimeError(
    operation.status === "recovery_required"
      ? "Une mise à jour Hermes nécessite une intervention avant de lancer une mission."
      : "Une mise à jour Hermes est en cours. Attendez son achèvement avant de lancer une mission.",
    409,
    "HERMES_UPDATE_BLOCKING_RUNS",
  );
}

async function executeOperation(id: string) {
  await updateRow(id, { status: "running", phase: "preflight", progress: 2, message: "Démarrage de la mise à jour Hermes…" });
  try {
    const result = await applyRuntimeUpdate(async (progress) => {
      await updateRow(id, progress);
    });
    await updateRow(id, {
      status: "succeeded",
      phase: "complete",
      progress: 100,
      message: result.updated ? "Hermes est à jour et le runtime est sain." : "Hermes était déjà à jour.",
      currentVersion: result.currentVersion,
      completedAt: new Date(),
    });
  } catch (error) {
    const code = errorCode(error);
    const message = error instanceof Error ? error.message : "La mise à jour Hermes a échoué.";
    const status: HermesRuntimeUpdateOperationStatus = code === "HERMES_UPDATE_ROLLED_BACK"
      ? "rolled_back"
      : code === "HERMES_UPDATE_RECOVERY_REQUIRED"
        ? "recovery_required"
        : "failed";
    await updateRow(id, {
      status,
      phase: status === "rolled_back" || status === "recovery_required" ? "rollback" : "complete",
      progress: status === "recovery_required" ? 99 : 100,
      message: status === "rolled_back" ? "La version précédente a été restaurée." : message,
      errorCode: code,
      errorMessage: message.slice(0, 1_000),
      completedAt: status === "recovery_required" ? null : new Date(),
    });
  }
}

async function reconcileInterrupted(row: typeof runtimeUpdateOperations.$inferSelect) {
  const plan = await getRuntimeUpdatePlan().catch(() => null);
  const current = plan?.currentVersion ?? null;
  if (current && row.targetVersion === current) {
    const updated = await updateRow(row.id, {
      status: "succeeded",
      phase: "complete",
      progress: 100,
      message: "Mise à jour réconciliée après redémarrage de la Console.",
      currentVersion: current,
      completedAt: new Date(),
    });
    return operationDto(updated);
  }
  if (current && row.previousVersion === current) {
    const updated = await updateRow(row.id, {
      status: "rolled_back",
      phase: "complete",
      progress: 100,
      message: "La version précédente est saine après interruption.",
      currentVersion: current,
      errorCode: "HERMES_UPDATE_INTERRUPTED",
      errorMessage: "Le worker de mise à jour a été interrompu.",
      completedAt: new Date(),
    });
    return operationDto(updated);
  }
  const updated = await updateRow(row.id, {
    status: "recovery_required",
    phase: "rollback",
    progress: 99,
    message: "L’état du runtime est ambigu après interruption. Intervention opérateur requise.",
    errorCode: "HERMES_UPDATE_STATE_AMBIGUOUS",
    errorMessage: "La version active ne correspond ni à la source ni à la cible.",
  });
  return operationDto(updated);
}

async function activeRow() {
  const database = getDatabase();
  const [row] = await database
    .select()
    .from(runtimeUpdateOperations)
    .where(and(eq(runtimeUpdateOperations.runtimeId, "default"), inArray(runtimeUpdateOperations.status, ACTIVE_STATUSES)))
    .orderBy(desc(runtimeUpdateOperations.createdAt))
    .limit(1);
  return row ?? null;
}

async function updateRow(id: string, patch: Partial<typeof runtimeUpdateOperations.$inferInsert>) {
  const database = getDatabase();
  const [row] = await database
    .update(runtimeUpdateOperations)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(runtimeUpdateOperations.id, id))
    .returning();
  if (!row) throw new Error("Opération de mise à jour introuvable.");
  return row;
}

function operationDto(row: typeof runtimeUpdateOperations.$inferSelect): HermesRuntimeUpdateOperationDto {
  const dto: HermesRuntimeUpdateOperationDto = {
    id: row.id,
    trigger: row.trigger as "manual" | "automatic",
    status: row.status as HermesRuntimeUpdateOperationStatus,
    phase: row.phase as HermesRuntimeUpdateOperationPhase,
    progress: row.progress,
    message: row.message,
    method: row.method as HermesRuntimeUpdateOperationDto["method"],
    previousVersion: row.previousVersion,
    targetVersion: row.targetVersion,
    targetTag: row.targetTag,
    currentVersion: row.currentVersion,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
  if (row.errorCode && row.errorMessage) dto.error = { code: row.errorCode, message: row.errorMessage };
  return dto;
}

function errorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") return error.code;
  return "HERMES_UPDATE_FAILED";
}
