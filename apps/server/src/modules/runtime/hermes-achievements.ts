import { z } from "zod";
import type {
  HermesAchievementDto,
  HermesAchievementsDto,
  HermesAchievementsScanStatusDto,
} from "@console/core/types/api";
import { HermesRuntimeError } from "./hermes-adapter";
import { dashboardJson, withDashboardBaseUrl } from "./hermes-skills-admin";

const ACHIEVEMENTS_PATH = "/api/plugins/hermes-achievements";

const achievementSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    description: z.string().default(""),
    category: z.string().default(""),
    icon: z.string().nullable().optional(),
    state: z.enum(["unlocked", "discovered", "secret"]).catch("discovered"),
    unlocked: z.boolean(),
    discovered: z.boolean().default(false),
    unlocked_at: z.number().nullable().optional(),
    progress: z.number().nullable().optional(),
    progress_pct: z.number().nullable().optional(),
    tier: z.string().nullable().optional(),
    next_tier: z.string().nullable().optional(),
    next_threshold: z.number().nullable().optional(),
    criteria: z.string().nullable().optional(),
  })
  .passthrough();

const achievementsResponseSchema = z
  .object({
    achievements: z.array(achievementSchema),
    unlocked_count: z.number().default(0),
    discovered_count: z.number().default(0),
    secret_count: z.number().default(0),
    total_count: z.number().default(0),
    error: z.string().nullable().optional(),
    generated_at: z.number().nullable().optional(),
    is_stale: z.boolean().default(false),
  })
  .passthrough();

const scanStatusSchema = z
  .object({
    state: z.enum(["idle", "running", "failed", "pending"]).catch("idle"),
    started_at: z.number().nullable().optional(),
    finished_at: z.number().nullable().optional(),
    last_error: z.string().nullable().optional(),
    last_duration_ms: z.number().nullable().optional(),
    run_count: z.number().default(0),
    snapshot_stale: z.boolean().default(false),
    snapshot_generated_at: z.number().nullable().optional(),
  })
  .passthrough();

function toAchievementDto(item: z.infer<typeof achievementSchema>): HermesAchievementDto {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    category: item.category,
    icon: item.icon ?? null,
    state: item.state,
    unlocked: item.unlocked,
    discovered: item.discovered,
    unlockedAt: item.unlocked_at ?? null,
    progress: item.progress ?? null,
    progressPct: item.progress_pct ?? null,
    tier: item.tier ?? null,
    nextTier: item.next_tier ?? null,
    nextThreshold: item.next_threshold ?? null,
    criteria: item.criteria ?? null,
  };
}

function toScanStatusDto(value: z.infer<typeof scanStatusSchema>): HermesAchievementsScanStatusDto {
  return {
    state: value.state,
    startedAt: value.started_at ?? null,
    finishedAt: value.finished_at ?? null,
    lastError: value.last_error ?? null,
    lastDurationMs: value.last_duration_ms ?? null,
    runCount: value.run_count,
    snapshotStale: value.snapshot_stale,
    snapshotGeneratedAt: value.snapshot_generated_at ?? null,
  };
}

function defaultScanStatus(): HermesAchievementsScanStatusDto {
  return {
    state: "idle",
    startedAt: null,
    finishedAt: null,
    lastError: null,
    lastDurationMs: null,
    runCount: 0,
    snapshotStale: false,
    snapshotGeneratedAt: null,
  };
}

/** Le plugin absent (404) se distingue d'un Dashboard injoignable. */
function pluginUnavailable(error: unknown): never {
  if (error instanceof HermesRuntimeError && error.status === 404) {
    throw new HermesRuntimeError(
      "Le plugin hermes-achievements n’est pas installé sur le Dashboard Hermes.",
      404,
      "HERMES_ACHIEVEMENTS_PLUGIN_UNAVAILABLE",
    );
  }
  throw error;
}

export async function listHermesAchievements(): Promise<HermesAchievementsDto> {
  return withDashboardBaseUrl(async (baseUrl) => {
    const body = (await dashboardJson<unknown>(
      baseUrl,
      `${ACHIEVEMENTS_PATH}/achievements`,
    ).catch(pluginUnavailable)) as Record<string, unknown>;

    const parsed = achievementsResponseSchema.parse(body);
    const embeddedStatus = scanStatusSchema.safeParse(
      (body.scan_meta as { status?: unknown } | undefined)?.status,
    );

    return {
      achievements: parsed.achievements.map(toAchievementDto),
      unlockedCount: parsed.unlocked_count,
      discoveredCount: parsed.discovered_count,
      secretCount: parsed.secret_count,
      totalCount: parsed.total_count,
      error: parsed.error ?? null,
      isStale: parsed.is_stale,
      scanStatus: embeddedStatus.success ? toScanStatusDto(embeddedStatus.data) : defaultScanStatus(),
    };
  });
}

export async function getHermesAchievementsScanStatus(): Promise<HermesAchievementsScanStatusDto> {
  return withDashboardBaseUrl(async (baseUrl) => {
    const body = await dashboardJson<unknown>(baseUrl, `${ACHIEVEMENTS_PATH}/scan-status`).catch(
      pluginUnavailable,
    );
    return toScanStatusDto(scanStatusSchema.parse(body));
  });
}
