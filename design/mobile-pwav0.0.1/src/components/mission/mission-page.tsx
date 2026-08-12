import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { orgPath } from "../mobile/mobile-nav";
import { ArrowUpIcon, ChevronRightIcon, ShieldAlertIcon } from "lucide-react";
import { GateCard } from "./gate-card";
import { MissionSheet } from "./mission-sheet";
import { MissionTimeline } from "./mission-timeline";
import { useMediaQuery } from "../mobile/use-media-query";
import { useApp } from "../../App";
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

function missionGroups() {
  return [
    {
      label: "Décisions",
      missions: MISSIONS.filter((mission) =>
        mission.status === "waiting" || pendingGates(eventsForMission(mission.id)).length > 0,
      ),
    },
    { label: "En cours", missions: MISSIONS.filter((mission) => mission.status === "running") },
    {
      label: "Terminées",
      missions: MISSIONS.filter(
        (mission) => mission.status === "done" || mission.status === "failed",
      ),
    },
  ];
}

/** Desktop lanes; also the backdrop of the side peek, where it stays clickable. */
export function MissionBoard({ activeMissionId }: { activeMissionId?: string }) {
  const location = useLocation();
  const { org = "" } = useParams();
  return (
    <div
      className={`mission-board mx-auto w-full max-w-5xl ${activeMissionId ? "mission-board--peeked" : ""}`}
      aria-label="Missions"
    >
      {missionGroups().map(({ label, missions }) => (
        <section key={label} className="mission-board__column" aria-label={label}>
          <header className="mission-board__head">
            <h2>{label}</h2>
            <span className="mission-board__count">{missions.length}</span>
          </header>
          {missions.length === 0 ? (
            <p className="mission-board__empty">Aucune mission</p>
          ) : (
            missions.map((mission) => {
              const events = eventsForMission(mission.id);
              const gates = pendingGates(events);
              return (
                <Link
                  key={mission.id}
                  to={{ pathname: orgPath(org, `/missions/${mission.id}`), search: location.search }}
                  aria-current={mission.id === activeMissionId ? "page" : undefined}
                  className="mission-card"
                >
                  <span className="mission-card__title">{mission.name}</span>
                  <span className="mission-card__intent">{mission.intent}</span>
                  <span className="mission-card__meta">
                    {mission.agent} · {events.length} événements
                    {gates.length ? (
                      <span className="mobile-badge">{gates.length}</span>
                    ) : null}
                  </span>
                </Link>
              );
            })
          )}
        </section>
      ))}
    </div>
  );
}

export function MissionsPage() {
  const { org = "" } = useParams();
  const isMobile = useMediaQuery("(max-width: 1023px)");
  if (!isMobile) return <MissionBoard />;

  return (
    <div className="mobile-stack mx-auto w-full max-w-2xl">
      {missionGroups()
        .filter(({ missions }) => missions.length > 0)
        .map(({ label, missions }) => (
          <section key={label} className="mobile-group" aria-label={label}>
            <h2 className="mobile-group__label">{label}</h2>
            <div className="mobile-list">
              {missions.map((mission) => {
                const events = eventsForMission(mission.id);
                const gates = pendingGates(events);
                return (
                  <Link key={mission.id} to={orgPath(org, `/missions/${mission.id}`)} className="mobile-row">
                    <span className="mobile-row__body">
                      <span className="mobile-row__title">{mission.name}</span>
                      <span className="mobile-row__detail">
                        {mission.agent} · {STATUS_LABEL[mission.status]} · {events.length} événements
                      </span>
                    </span>
                    {gates.length ? <span className="mobile-badge">{gates.length}</span> : null}
                    <ChevronRightIcon className="size-4 shrink-0 text-[var(--text-tertiary)]" />
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
    </div>
  );
}

function MissionDetail({ mission }: { mission: Mission }) {
  const { org = "" } = useParams();
  const { channels } = useApp();
  /* A mission keeps its channelId after the channel is deleted or renamed, so
     the link is resolved against the live list: the label follows a rename, and
     an id that no longer resolves degrades to plain text instead of a dead link.
     The list is the *accessible* one, so a private channel reads as unavailable
     too — hence the wording, which claims nothing about deletion. */
  const missionChannel = mission.channelId
    ? channels.find((channel) => channel.id === mission.channelId)
    : undefined;
  const [lens, setLens] = useState<EventLens>("all");
  const [decisions, setDecisions] = useState<Record<string, GateDecision>>({});

  const events = useMemo(() => eventsForMission(mission.id), [mission.id]);
  const visible = useMemo(() => filterByLens(events, lens), [events, lens]);
  const decisionOf = (gateId: string, fallback: GateDecision = "pending") =>
    decisions[gateId] ?? fallback;
  const pending = events.filter(
    (event) => event.kind === "gate" && decisionOf(event.id, event.decision ?? "pending") === "pending",
  );

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
          {missionChannel ? (
            <>
              {" · "}
              <Link
                to={orgPath(org, `/channels/${encodeURIComponent(missionChannel.id)}`)}
                className="underline underline-offset-2"
              >
                #{missionChannel.name}
              </Link>
            </>
          ) : mission.channelId ? (
            <> · canal indisponible</>
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

export function MissionPage() {
  const { org = "", missionId = "" } = useParams();
  const isMobile = useMediaQuery("(max-width: 1023px)");
  const navigate = useNavigate();
  const location = useLocation();
  const mission = missionById(missionId);

  if (!mission) {
    return (
      <p className="mission-empty">
        Cette mission n'existe pas.{" "}
        <Link to={{ pathname: orgPath(org, "/missions"), search: location.search }}>
          Revenir à la liste
        </Link>
      </p>
    );
  }

  if (isMobile) return <MissionDetail mission={mission} />;

  // Same route on desktop, rendered as a side peek: the board stays behind and
  // clickable, closing is a hierarchical navigation back to /missions.
  return (
    <>
      <MissionBoard activeMissionId={mission.id} />
      <MissionSheet
        label={mission.name}
        onClose={() => navigate({ pathname: orgPath(org, "/missions"), search: location.search })}
      >
        <MissionDetail key={mission.id} mission={mission} />
      </MissionSheet>
    </>
  );
}
