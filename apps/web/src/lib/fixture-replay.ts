/**
 * Rejeu des fixtures du spike Phase 0.
 *
 * Alimente l'UI avec des evenements REELS captures contre le runtime Hermes,
 * sans backend, sans base et sans consommer de tokens. C'est ce qui permet de
 * construire l'ecran le plus difficile avant que la Phase 1 n'existe.
 */
import rawEvents from "@/fixtures/real-run-events.json";
import runStatus from "@/fixtures/real-run-status.json";
import runArtifacts from "@/fixtures/real-run-artifacts.json";
import type { HermesEvent } from "./hermes-events";

export const FIXTURE_EVENTS = rawEvents as unknown as HermesEvent[];

export const FIXTURE_RUN = {
  runId: (runStatus as { run_id?: string }).run_id ?? "run_fixture",
  prompt:
    "Lis le fichier /work/runs/<id>/in/notes.txt, additionne les nombres, " +
    "puis écris le total seul dans /work/runs/<id>/out/total.txt. Sois bref.",
  instructions:
    "Tu es « Agent Fichiers ». Utilise tes outils. Termine par [SPIKE-AGENT].",
  agentName: "Agent Fichiers",
  model: "gpt-5.4-nano",
  status: (runStatus as { status?: string }).status ?? "completed",
  output: (runStatus as { output?: string }).output ?? null,
  usage: (runStatus as { usage?: { input_tokens: number; output_tokens: number; total_tokens: number } })
    .usage ?? null,
  artifacts: (runArtifacts as { artifacts: { filename: string; content: string }[] }).artifacts,
};

export type ReplaySpeed = "realtime" | "fast" | "instant";

/**
 * Rejoue les evenements en respectant leurs intervalles reels.
 * `signal` permet d'interrompre proprement au demontage du composant.
 */
export async function* replayFixtures(
  events: HermesEvent[] = FIXTURE_EVENTS,
  { speed = "fast", signal }: { speed?: ReplaySpeed; signal?: AbortSignal } = {},
): AsyncGenerator<HermesEvent> {
  const divisor = speed === "realtime" ? 1 : speed === "fast" ? 6 : Infinity;
  let previous: number | null = null;

  for (const ev of events) {
    if (signal?.aborted) return;
    if (previous !== null && divisor !== Infinity) {
      // timestamp en SECONDES flottantes
      const gapMs = Math.max(0, (ev.timestamp - previous) * 1000) / divisor;
      if (gapMs > 0) {
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, Math.min(gapMs, 2000));
          signal?.addEventListener("abort", () => {
            clearTimeout(t);
            resolve();
          }, { once: true });
        });
      }
    }
    if (signal?.aborted) return;
    previous = ev.timestamp;
    yield ev;
  }
}
