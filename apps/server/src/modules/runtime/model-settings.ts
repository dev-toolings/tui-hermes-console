import { eq } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { runtimeModelSettings } from "@/db/schema";
import {
  isHermesReasoningEffort,
  type HermesReasoningEffort,
} from "@console/core/lib/runtime/reasoning-effort";

const SETTINGS_ID = "default";

export type RuntimeModelSelection = {
  provider: string | null;
  model: string | null;
  reasoningEffort: HermesReasoningEffort | null;
};

export async function getRuntimeModelSelection(): Promise<RuntimeModelSelection> {
  const [row] = await getDatabase()
    .select()
    .from(runtimeModelSettings)
    .where(eq(runtimeModelSettings.id, SETTINGS_ID))
    .limit(1);

  return {
    provider: row?.provider?.trim() || null,
    model: row?.model?.trim() || null,
    reasoningEffort: isHermesReasoningEffort(row?.reasoningEffort)
      ? row.reasoningEffort
      : null,
  };
}

export async function saveRuntimeModelSelection(
  selection: RuntimeModelSelection,
): Promise<void> {
  const now = new Date();
  await getDatabase()
    .insert(runtimeModelSettings)
    .values({ id: SETTINGS_ID, ...selection, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: runtimeModelSettings.id,
      set: { ...selection, updatedAt: now },
    });
}
