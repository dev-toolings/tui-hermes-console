/**
 * Mission event model.
 *
 * A human message, a tool call, a git push and an authorization request are the
 * same primitive: a dated event attached to a mission. `kind` says what the
 * event is, `noise` says how loud it is allowed to be on screen. The renderer
 * only reads `noise`, which is what keeps a 400-event run from burying a
 * two-line conversation.
 */

export type EventKind =
  | "message"
  | "tool"
  | "patch"
  | "gate"
  | "artifact"
  | "git"
  | "state";

/** Signal ladder. `decision` is a full card, `fact` a line, `trace` a fold. */
export type EventNoise = "decision" | "fact" | "trace";

export type EventLens = "all" | "talk" | "exec" | "audit";

export type ActorKind = "human" | "agent" | "system";

export type MissionActor = { kind: ActorKind; id: string };

export type GateDecision = "pending" | "approved" | "refused";

export type BlastRadius = {
  files: number;
  added: number;
  removed: number;
  environment: string;
  /** Drives the danger treatment on the gate, never the color alone. */
  irreversible: boolean;
};

export type MissionEvent = {
  id: string;
  missionId: string;
  /** ISO 8601 in the data, formatted at display time only. */
  at: string;
  actor: MissionActor;
  kind: EventKind;
  noise: EventNoise;
  title: string;
  detail?: string;
  /** Technical value rendered in mono: a path, a command, an identifier. */
  value?: string;
  refs?: {
    runId?: string;
    artifactId?: string;
    parentId?: string;
    /** Timestamp this event is anchored to, for a comment pinned on a run. */
    anchorAt?: string;
  };
  blastRadius?: BlastRadius;
  decision?: GateDecision;
};

export type Mission = {
  id: string;
  name: string;
  intent: string;
  status: "running" | "waiting" | "done" | "failed";
  agent: string;
  channelId: string | null;
  startedAt: string;
};

/**
 * Default loudness of a kind. Explicit `noise` on an event always wins: a
 * failing tool call is a fact, not a trace, even though tools are traces.
 */
export function defaultNoise(kind: EventKind): EventNoise {
  if (kind === "gate") return "decision";
  if (kind === "tool") return "trace";
  return "fact";
}

const LENS_KINDS: Record<EventLens, EventKind[] | null> = {
  all: null,
  talk: ["message"],
  exec: ["tool", "patch", "git", "artifact"],
  audit: ["gate", "state"],
};

export const LENSES: Array<{ id: EventLens; label: string }> = [
  { id: "all", label: "Tout" },
  { id: "talk", label: "Échanges" },
  { id: "exec", label: "Exécution" },
  { id: "audit", label: "Audit" },
];

export function filterByLens(events: MissionEvent[], lens: EventLens) {
  const kinds = LENS_KINDS[lens];
  if (!kinds) return events;
  return events.filter((event) => kinds.includes(event.kind));
}

export type TimelineRow =
  | { type: "event"; key: string; event: MissionEvent }
  | {
      type: "trace";
      key: string;
      actor: MissionActor;
      events: MissionEvent[];
      from: string;
      to: string;
    };

/**
 * Collapses consecutive traces from the same actor into one row. Decisions and
 * facts always keep their own row, so a pending gate can never be folded away.
 */
export function buildTimeline(events: MissionEvent[]): TimelineRow[] {
  const rows: TimelineRow[] = [];
  for (const event of events) {
    if (event.noise !== "trace") {
      rows.push({ type: "event", key: event.id, event });
      continue;
    }
    const last = rows[rows.length - 1];
    if (last?.type === "trace" && last.actor.id === event.actor.id) {
      last.events.push(event);
      last.to = event.at;
      continue;
    }
    rows.push({
      type: "trace",
      key: `trace-${event.id}`,
      actor: event.actor,
      events: [event],
      from: event.at,
      to: event.at,
    });
  }
  return rows;
}

export function pendingGates(events: MissionEvent[]) {
  return events.filter(
    (event) => event.kind === "gate" && (event.decision ?? "pending") === "pending",
  );
}

export function formatTime(at: string) {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDay(at: string) {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

export function isSameDay(left: string, right: string) {
  const a = new Date(left);
  const b = new Date(right);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// --- Fixtures -------------------------------------------------------------
// A deliberately loud mission: 186 tool calls around four human beats. It
// exists to prove the ladder holds under the volume a real run produces.

const BASE = Date.parse("2026-08-11T09:41:00.000Z");
const at = (minutes: number, seconds = 0) =>
  new Date(BASE + minutes * 60_000 + seconds * 1_000).toISOString();

const TOOL_STEPS = [
  ["lecture", "src/purge/worker.rs"],
  ["recherche", "grep -rn retention_days"],
  ["lecture", "migrations/0042_retention.sql"],
  ["exécution", "cargo check -p purge"],
  ["lecture", "crates/purge/src/schedule.rs"],
  ["exécution", "psql -c 'explain analyze delete ...'"],
] as const;

function traceRun(missionId: string, runId: string, count: number, startMinute: number) {
  return Array.from({ length: count }, (_, index) => {
    const [label, value] = TOOL_STEPS[index % TOOL_STEPS.length];
    return {
      id: `${runId}-t${index.toString().padStart(3, "0")}`,
      missionId,
      at: at(startMinute, index * 4),
      actor: { kind: "agent", id: "agent-purge" },
      kind: "tool",
      noise: "trace",
      title: label,
      value,
      refs: { runId },
    } satisfies MissionEvent;
  });
}

export const MISSIONS: Mission[] = [
  {
    id: "purge-worker",
    name: "Déployer le worker de purge",
    intent: "Ne conserver que 90 jours de journaux applicatifs en production.",
    status: "waiting",
    agent: "agent-purge",
    channelId: "incidents",
    startedAt: at(0),
  },
  {
    id: "checkout-stripe",
    name: "Refonte du parcours de paiement",
    intent: "Migrer le webhook de confirmation Stripe sans coupure.",
    status: "running",
    agent: "hermes",
    channelId: "general",
    startedAt: at(-120),
  },
];

export const MISSION_EVENTS: MissionEvent[] = [
  {
    id: "pw-01",
    missionId: "purge-worker",
    at: at(0),
    actor: { kind: "human", id: "Kev Tourteau" },
    kind: "message",
    noise: "fact",
    title: "On ne purge que ce qui dépasse 90 jours, et jamais les journaux d'audit.",
  },
  ...traceRun("purge-worker", "run-7c21", 186, 1),
  {
    id: "pw-02",
    missionId: "purge-worker",
    at: at(14),
    actor: { kind: "agent", id: "agent-purge" },
    kind: "patch",
    noise: "fact",
    title: "Correctif prêt",
    detail: "4 fichiers, la rétention passe en paramètre du worker.",
    value: "+18 / −12 400",
    refs: { runId: "run-7c21", artifactId: "patch-7c21" },
  },
  {
    id: "pw-gate",
    missionId: "purge-worker",
    at: at(14, 30),
    actor: { kind: "agent", id: "agent-purge" },
    kind: "gate",
    noise: "decision",
    title: "Supprimer 12 400 lignes de journaux en production",
    detail:
      "La suppression porte sur app_logs et job_logs. Les journaux d'audit sont exclus par la clause de rétention.",
    decision: "pending",
    blastRadius: {
      files: 4,
      added: 18,
      removed: 12_400,
      environment: "production",
      irreversible: true,
    },
    refs: { runId: "run-7c21" },
  },
  {
    id: "pw-03",
    missionId: "purge-worker",
    at: at(16),
    actor: { kind: "human", id: "Ana Ferreira" },
    kind: "message",
    noise: "fact",
    title: "J'ai vérifié la sauvegarde de cette nuit, elle est complète.",
  },
  {
    id: "pw-04",
    missionId: "purge-worker",
    at: at(17),
    actor: { kind: "system", id: "git" },
    kind: "git",
    noise: "fact",
    title: "Branche poussée",
    value: "feat/purge-retention · 2c13687",
  },
  {
    id: "pw-05",
    missionId: "purge-worker",
    at: at(18),
    actor: { kind: "agent", id: "agent-purge" },
    kind: "artifact",
    noise: "fact",
    title: "Plan d'exécution SQL joint",
    value: "purge-plan.sql",
    refs: { artifactId: "purge-plan" },
  },
  {
    id: "cs-01",
    missionId: "checkout-stripe",
    at: at(-120),
    actor: { kind: "human", id: "Kev Tourteau" },
    kind: "message",
    noise: "fact",
    title: "Le webhook de confirmation doit rester compatible avec l'ancien format.",
  },
  ...traceRun("checkout-stripe", "run-1188", 42, -118),
  {
    id: "cs-02",
    missionId: "checkout-stripe",
    at: at(-100),
    actor: { kind: "agent", id: "hermes" },
    kind: "state",
    noise: "fact",
    title: "Étape 2 sur 4 : adaptation du webhook",
  },
];

export function missionById(missionId: string) {
  return MISSIONS.find((mission) => mission.id === missionId) ?? null;
}

export function eventsForMission(missionId: string) {
  return MISSION_EVENTS.filter((event) => event.missionId === missionId);
}
