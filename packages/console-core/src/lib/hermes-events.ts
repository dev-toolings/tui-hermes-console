/**
 * Normalisation des evenements Hermes — PRD §13.1.
 *
 * Toutes les formes ci-dessous ont ete MESUREES contre le runtime reel
 * (spike Phase 0, fixtures dans spike/fixtures/). Ne pas se fier a la
 * documentation officielle : elle annonce `assistant.delta`, le runtime
 * emet `message.delta`.
 */

/** Evenement brut du runtime. Le type est DANS le JSON ; il n'y a ni `event:` ni `id:` SSE. */
export type HermesEvent = {
  event: string;
  run_id: string;
  /** Epoch FLOTTANT en secondes, pas ISO. */
  timestamp: number;
  [k: string]: unknown;
};

export type RunEventType =
  | "agent.message"
  | "agent.reasoning"
  | "tool.call"
  | "tool.result"
  | "approval.requested"
  | "run.error"
  | "run.completed"
  | "system.notice"
  | "raw";

export type RunEvent = {
  /** Attribue par la Console : le runtime n'emet aucun identifiant. */
  sequence: number;
  type: RunEventType;
  occurredAt: Date;
  payload: Record<string, unknown>;
};

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

/** Intervalle de flush des deltas. Mesure : 33,6 deltas/s a 4 caracteres piece. */
export const DELTA_FLUSH_MS = 100;

/**
 * Normaliseur a etat. Une instance par mission.
 *
 * Deux problemes que le runtime nous laisse resoudre :
 *  1. aucun identifiant d'evenement -> on genere une `sequence` monotone ;
 *  2. aucun identifiant d'appel d'outil -> on apparie `tool.started` et
 *     `tool.completed` en FIFO par nom d'outil.
 */
export class HermesEventNormalizer {
  private sequence: number;

  /**
   * `startAt` doit valoir MAX(sequence)+1 quand on reprend une mission qui a
   * deja des evenements persistes (resume au boot, annulation hors process,
   * cloture d'orphelin). Repartir de 0 viole UNIQUE(run_id, sequence) et fait
   * echouer la transition d'etat qui suit.
   */
  constructor(startAt = 0) {
    this.sequence = startAt;
  }
  /** File FIFO des appels d'outil ouverts, par nom d'outil. */
  private openToolCalls = new Map<string, string[]>();
  private toolCallCounter = 0;

  /** Tampon de coalescing des deltas. */
  private buffer = "";
  private bufferStartedAt: Date | null = null;

  private next(type: RunEventType, occurredAt: Date, payload: Record<string, unknown>): RunEvent {
    return { sequence: this.sequence++, type, occurredAt, payload };
  }

  private toDate(ts: unknown): Date {
    // Epoch flottant en SECONDES -> millisecondes.
    return typeof ts === "number" ? new Date(ts * 1000) : new Date();
  }

  /** Vide le tampon de deltas en un unique evenement `agent.message`. */
  flush(): RunEvent[] {
    if (!this.buffer) return [];
    const text = this.buffer;
    const at = this.bufferStartedAt ?? new Date();
    this.buffer = "";
    this.bufferStartedAt = null;
    return [this.next("agent.message", at, { text })];
  }

  /**
   * Consomme un evenement runtime. Renvoie 0..n evenements produit.
   * Les deltas sont accumules : appeler `flush()` toutes les DELTA_FLUSH_MS.
   */
  push(ev: HermesEvent): RunEvent[] {
    const at = this.toDate(ev.timestamp);

    switch (ev.event) {
      case "message.delta": {
        // Coalescing : persister un delta par ligne est exclu.
        this.buffer += String(ev.delta ?? "");
        this.bufferStartedAt ??= at;
        return [];
      }

      case "tool.started": {
        const tool = String(ev.tool ?? "outil");
        const toolCallId = `tc_${this.toolCallCounter++}`;
        const queue = this.openToolCalls.get(tool) ?? [];
        queue.push(toolCallId);
        this.openToolCalls.set(tool, queue);
        // Le texte deja accumule precede l'appel : on le sort d'abord.
        return [
          ...this.flush(),
          this.next("tool.call", at, { toolCallId, tool, preview: ev.preview ?? null }),
        ];
      }

      case "tool.completed": {
        const tool = String(ev.tool ?? "outil");
        const queue = this.openToolCalls.get(tool) ?? [];
        // Appariement FIFO, faute d'identifiant cote runtime.
        const toolCallId = queue.shift() ?? `tc_orphan_${this.toolCallCounter++}`;
        this.openToolCalls.set(tool, queue);
        return [
          this.next("tool.result", at, {
            toolCallId,
            tool,
            durationMs: typeof ev.duration === "number" ? ev.duration * 1000 : null,
            error: ev.error === true,
            // MESURE : le runtime ne transmet AUCUN resultat d'outil.
            // L'UI ne doit pas laisser croire qu'un detail est repliable.
            hasResultPayload: false,
          }),
        ];
      }

      case "approval.request": {
        return [
          ...this.flush(),
          this.next("approval.requested", at, {
            command: ev.command ?? null,
            choices: Array.isArray(ev.choices) ? ev.choices : [],
            description: ev.description ?? null,
          }),
        ];
      }

      case "run.completed": {
        const usage = (ev.usage ?? null) as Record<string, number> | null;
        return [
          ...this.flush(),
          this.next("run.completed", at, {
            output: ev.output ?? null,
            usage: usage
              ? ({
                  inputTokens: usage.input_tokens ?? 0,
                  outputTokens: usage.output_tokens ?? 0,
                  totalTokens: usage.total_tokens ?? 0,
                } satisfies TokenUsage)
              : null,
          }),
        ];
      }

      case "run.failed":
      case "run.error": {
        return [
          ...this.flush(),
          this.next("run.error", at, { message: ev.message ?? ev.error ?? "Erreur inconnue" }),
        ];
      }

      case "run.cancelled": {
        return [
          ...this.flush(),
          this.next("system.notice", at, {
            message: "Mission annulée.",
            kind: "cancelled",
          }),
        ];
      }

      // MESURE : malgre son nom, `reasoning.available` ne contient pas de
      // raisonnement mais le TEXTE FINAL COMPLET, doublon de
      // run.completed.output. Le rendre afficherait la reponse deux fois.
      case "reasoning.available":
        return [];

      default:
        // Le runtime evolue : un type inconnu reste visible, jamais perdu.
        return [...this.flush(), this.next("raw", at, { ...ev })];
    }
  }

  notice(message: string, kind: string): RunEvent {
    return this.next("system.notice", new Date(), { message, kind });
  }

  error(message: string): RunEvent {
    return this.next("run.error", new Date(), { message });
  }
}
