/**
 * Channel attention model.
 *
 * A channel is presented by what it decides and executes, not by its last
 * message. Everything here is derived from the mission model: the channel
 * never stores its own state, so the list and the mission page can never
 * disagree. One closed vocabulary, resolved once, reused by the channels
 * index and the sidebar.
 */

import {
  eventsForMission,
  MISSIONS,
  pendingGates,
  type Mission,
  type MissionEvent,
} from "./mission-events";

/** Priority ladder: a decision always outranks a running agent. */
export type ChannelAttentionState =
  | "decision"
  | "question"
  | "working"
  | "activity"
  | "calm";

export type ChannelAttention = {
  state: ChannelAttentionState;
  missions: Mission[];
  /** Pending gates across every mission bound to the channel. */
  gates: Array<{ mission: Mission; gate: MissionEvent }>;
  /** Agent of the mission currently running in the channel, if any. */
  workingAgent: string | null;
  workingSince: string | null;
};

/**
 * The same ladder as `resolveAttentionState`, in sortable form: sections group
 * the channel list, so attention has to survive as an ordering instead.
 */
export const ATTENTION_ORDER: ChannelAttentionState[] = [
  "decision",
  "question",
  "working",
  "activity",
  "calm",
];

/** Text twin of the dot — state is never carried by color alone. */
export const ATTENTION_LABEL: Record<ChannelAttentionState, string> = {
  decision: "Décision attendue",
  question: "Réponse attendue",
  working: "Agent actif",
  activity: "Activité récente",
  calm: "",
};

export function missionsForChannel(channelId: string): Mission[] {
  return MISSIONS.filter((mission) => mission.channelId === channelId);
}

/** The one place the priority is written down. */
export function resolveAttentionState(input: {
  hasPendingGate: boolean;
  hasWaitingMission: boolean;
  hasRunningMission: boolean;
  hasUnread: boolean;
}): ChannelAttentionState {
  if (input.hasPendingGate) return "decision";
  if (input.hasWaitingMission) return "question";
  if (input.hasRunningMission) return "working";
  if (input.hasUnread) return "activity";
  return "calm";
}

export function channelAttention(
  channelId: string,
  opts: { hasUnread?: boolean } = {},
): ChannelAttention {
  const missions = missionsForChannel(channelId);
  const gates = missions.flatMap((mission) =>
    pendingGates(eventsForMission(mission.id)).map((gate) => ({ mission, gate })),
  );
  const running = missions.find((mission) => mission.status === "running") ?? null;
  const state = resolveAttentionState({
    hasPendingGate: gates.length > 0,
    hasWaitingMission: missions.some((mission) => mission.status === "waiting"),
    hasRunningMission: Boolean(running),
    hasUnread: Boolean(opts.hasUnread),
  });
  return {
    state,
    missions,
    gates,
    workingAgent: running?.agent ?? null,
    workingSince: running?.startedAt ?? null,
  };
}

/** Elapsed time as an operator reads it: "3 min", "2 h", "5 j". */
export function formatElapsed(fromIso: string, nowMs = Date.now()): string {
  const from = Date.parse(fromIso);
  if (Number.isNaN(from)) return "";
  const minutes = Math.max(1, Math.floor((nowMs - from) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} j`;
}
