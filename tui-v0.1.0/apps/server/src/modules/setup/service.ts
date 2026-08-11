import { and, eq, isNull, sql } from "drizzle-orm";
import { consoleSetup, runtimeConfig } from "@/db/schema";
import { getDatabase } from "@/db/client";
import {
  getRuntimePublic,
  databaseRevisionFromRuntimeVersion,
  isRuntimeConfigurationVersionCurrent,
  probeAndPersistRuntime,
  type RuntimeConfigurationVersion,
} from "@/modules/runtime/config";

const SETUP_ID = "default";

export type ConsoleSetupStep = "runtime" | "agent" | "completed";

export class SetupError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
  }
}

const STEP_INDEX: Record<ConsoleSetupStep, number> = {
  runtime: 0,
  agent: 1,
  completed: 2,
};

export function validateSetupTransition(input: {
  current: ConsoleSetupStep;
  target: ConsoleSetupStep;
  runtimeConfigured: boolean;
  hasCurrentAiConsent: boolean;
}) {
  if (input.current === input.target) return { changed: false, requiresProbe: false };
  if (STEP_INDEX[input.target] < STEP_INDEX[input.current]) {
    throw new SetupError(
      "La mise en service ne peut pas revenir à une étape précédente.",
      409,
      "SETUP_TRANSITION_NOT_MONOTONIC",
    );
  }
  if (STEP_INDEX[input.target] !== STEP_INDEX[input.current] + 1) {
    throw new SetupError(
      "Terminez l’étape courante avant de poursuivre.",
      409,
      "SETUP_STEP_SKIPPED",
    );
  }
  if (!input.runtimeConfigured) {
    throw new SetupError(
      "Connectez Hermes avant de poursuivre la mise en service.",
      409,
      "SETUP_RUNTIME_REQUIRED",
    );
  }
  if (input.target === "completed" && !input.hasCurrentAiConsent) {
    throw new SetupError(
      "Acceptez la notice d’utilisation de l’IA avant d’ouvrir la Console.",
      428,
      "AI_DISCLOSURE_CONSENT_REQUIRED",
    );
  }
  return { changed: true, requiresProbe: input.target === "completed" };
}

export async function getConsoleSetup() {
  const db = getDatabase();
  let [row] = await db
    .select()
    .from(consoleSetup)
    .where(eq(consoleSetup.id, SETUP_ID))
    .limit(1);
  if (
    row?.step === "completed" &&
    (!row.runtimeConfigVersion ||
      !(await isRuntimeConfigurationVersionCurrent(
        row.runtimeConfigVersion as RuntimeConfigurationVersion,
      )))
  ) {
    await db
      .update(consoleSetup)
      .set({
        step: "agent",
        completedAt: null,
        runtimeVerifiedAt: null,
        runtimeConfigVersion: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(consoleSetup.id, SETUP_ID),
          eq(consoleSetup.step, "completed"),
          row.runtimeConfigVersion === null
            ? isNull(consoleSetup.runtimeConfigVersion)
            : eq(consoleSetup.runtimeConfigVersion, row.runtimeConfigVersion),
        ),
      );
    [row] = await db
      .select()
      .from(consoleSetup)
      .where(eq(consoleSetup.id, SETUP_ID))
      .limit(1);
  }
  const runtime = await getRuntimePublic();
  return {
    step: row?.step ?? "runtime",
    runtimeVerifiedAt: row?.runtimeVerifiedAt?.toISOString() ?? null,
    runtime: {
      configured: runtime.configured,
      lastHealthStatus: runtime.lastHealthStatus,
    },
  } as const;
}

export async function setConsoleSetupStep(
  step: ConsoleSetupStep,
  options: { hasCurrentAiConsent: boolean },
) {
  const db = getDatabase();
  const now = new Date();
  await db
    .insert(consoleSetup)
    .values({
      id: SETUP_ID,
      step: "runtime",
      completedAt: null,
      runtimeVerifiedAt: null,
      runtimeConfigVersion: null,
      updatedAt: now,
    })
    .onConflictDoNothing();
  const [current] = await db
    .select({ step: consoleSetup.step })
    .from(consoleSetup)
    .where(eq(consoleSetup.id, SETUP_ID))
    .limit(1);
  const runtime = await getRuntimePublic();
  const transition = validateSetupTransition({
    current: current?.step ?? "runtime",
    target: step,
    runtimeConfigured: runtime.configured,
    hasCurrentAiConsent: options.hasCurrentAiConsent,
  });
  if (!transition.changed) return getConsoleSetup();
  let probedRuntimeVersion: RuntimeConfigurationVersion | null = null;
  if (transition.requiresProbe) {
    const probe = await probeAndPersistRuntime();
    probedRuntimeVersion = probe.configurationVersion;
    if (
      !probedRuntimeVersion ||
      !(await isRuntimeConfigurationVersionCurrent(probedRuntimeVersion))
    ) {
      throw new SetupError(
        "La configuration Hermes a changé depuis le probe. Testez-la de nouveau.",
        409,
        "SETUP_RUNTIME_PROOF_STALE",
      );
    }
  }

  const transitionedAt = new Date();
  const databaseRevision = probedRuntimeVersion
    ? databaseRevisionFromRuntimeVersion(probedRuntimeVersion)
    : null;
  const [updated] = await db
    .update(consoleSetup)
    .set({
      step,
      completedAt: step === "completed" ? transitionedAt : null,
      runtimeVerifiedAt: step === "completed" ? transitionedAt : null,
      runtimeConfigVersion:
        step === "completed" ? probedRuntimeVersion : null,
      updatedAt: transitionedAt,
    })
    .where(
      and(
        eq(consoleSetup.id, SETUP_ID),
        eq(consoleSetup.step, current?.step ?? "runtime"),
        ...(databaseRevision === null
          ? []
          : [
              sql`EXISTS (
                SELECT 1 FROM ${runtimeConfig}
                WHERE ${runtimeConfig.id} = 'default'
                  AND ${runtimeConfig.configRevision} = ${databaseRevision}
              )`,
            ]),
      ),
    )
    .returning({ step: consoleSetup.step });
  if (!updated) {
    const latest = await getConsoleSetup();
    if (latest.step === step) return latest;
    throw new SetupError(
      "Le setup ou la configuration Hermes a changé pendant cette requête. Relancez le probe.",
      409,
      "SETUP_RUNTIME_PROOF_STALE",
    );
  }
  return getConsoleSetup();
}

export async function consoleSetupRequired() {
  return (await getConsoleSetup()).step !== "completed";
}
