import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowUpIcon, ChevronRightIcon, ShieldAlertIcon } from "lucide-react";
import { GateCard } from "./gate-card";
import { MissionTimeline } from "./mission-timeline";
import {
  LENSES,
  MISSIONS,
  eventsForMission,
  filterByLens,
  missionById,
  pendingGates,
  type EventLens,
  type GateDecision,
  type Mission,
} from "../../state/mission-events";
import "../../styles/mission.css";

const STATUS_LABEL: Record<Mission["status"], string> = {
  running: "En cours",
  waiting: "En attente d'une décision",
  done: "Terminée",
  failed: "Échec",
};

export function MissionsPage() {
  return (
    <div className="mobile-stack mx-auto w-full max-w-2xl">
      <section className="mobile-list" aria-label="Missions">
        {MISSIONS.map((mission) => {
          const events = eventsForMission(mission.id);
          const gates = pendingGates(events);
          return (
            <Link key={mission.id} to={`/missions/${mission.id}`} className="mobile-row">
              <span className="mobile-row__body">
                <span className="mobile-row__title">{mission.name}</span>
                <span className="mobile-row__detail">
                  {mission.agent} · {STATUS_LABEL[mission.status]} · {events.length} événements
                </span>
              </span>
              {gates.length ? (
                <span className="mobile-badge">{gates.length}</span>
              ) : null}
              <ChevronRightIcon className="size-4 shrink-0 text-[var(--text-tertiary)]" />
            </Link>
          );
        })}
      </section>
    </div>
  );
}

export function MissionPage() {
  const { missionId = "" } = useParams();
  const mission = missionById(missionId);
  const [lens, setLens] = useState<EventLens>("all");
  const [decisions, setDecisions] = useState<Record<string, GateDecision>>({});

  const events = useMemo(() => eventsForMission(missionId), [missionId]);
  const visible = useMemo(() => filterByLens(events, lens), [events, lens]);
  const decisionOf = (gateId: string, fallback: GateDecision = "pending") =>
    decisions[gateId] ?? fallback;
  const pending = events.filter(
    (event) => event.kind === "gate" && decisionOf(event.id, event.decision ?? "pending") === "pending",
  );

  if (!mission) {
    return (
      <p className="mission-empty">
        Cette mission n'existe pas. <Link to="/missions">Revenir à la liste</Link>
      </p>
    );
  }

  return (
    <div className="mission-page mx-auto w-full max-w-[var(--container-content)]">
      <header className="flex flex-col gap-1">
        <h1 className="text-[16px] font-semibold leading-[22px] text-[var(--foreground)]">
          {mission.name}
        </h1>
        <p className="max-w-[70ch] text-[13px] leading-[18px] text-[var(--muted-foreground)]">
          {mission.intent}
        </p>
        <p className="text-[12px] leading-4 text-[var(--muted-foreground)]">
          {mission.agent} · {STATUS_LABEL[mission.status]}
          {mission.channelId ? (
            <>
              {" · "}
              <Link
                to={`/channels/${mission.channelId}`}
                className="underline underline-offset-2"
              >
                #{mission.channelId}
              </Link>
            </>
          ) : null}
        </p>
      </header>

      {/* The gate lives above the stream and above every lens: filtering the
          timeline must never be able to hide a decision that is waiting. */}
      {pending.map((gate) => (
        <GateCard
          key={gate.id}
          gate={gate}
          decision="pending"
          onDecide={(decision) =>
            setDecisions((current) => ({ ...current, [gate.id]: decision }))
          }
        />
      ))}

      <nav className="mission-lenses" aria-label="Lentilles de la mission">
        {LENSES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={lens === entry.id}
            onClick={() => setLens(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      <MissionTimeline
        events={visible}
        renderDecision={(event) => {
          const decision = decisionOf(event.id, event.decision ?? "pending");
          if (decision === "pending") {
            return (
              <p className="mission-fact">
                <span className="mission-fact__time" />
                <span className="mission-fact__body">
                  <ShieldAlertIcon
                    size={14}
                    aria-hidden="true"
                    className="mr-1.5 inline align-[-2px] text-[var(--state-neg-fg)]"
                  />
                  Autorisation en attente, épinglée en haut de la mission
                  <ArrowUpIcon
                    size={13}
                    aria-hidden="true"
                    className="ml-1 inline align-[-1px] text-[var(--muted-foreground)]"
                  />
                </span>
              </p>
            );
          }
          return (
            <GateCard gate={event} decision={decision} onDecide={() => undefined} />
          );
        }}
      />
    </div>
  );
}
