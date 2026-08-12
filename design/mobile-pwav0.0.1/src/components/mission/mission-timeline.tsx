import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import {
  buildTimeline,
  formatDay,
  formatTime,
  isSameDay,
  type MissionActor,
  type MissionEvent,
  type TimelineRow,
} from "../../state/mission-events";

export type MissionTimelineProps = {
  events: MissionEvent[];
  /** Rendered in place of a raw gate line, so the decision keeps its card. */
  renderDecision?: (event: MissionEvent) => React.ReactNode;
};

/**
 * One stream, three renderings driven by `noise`. A decision gets a card, a
 * fact gets a line, a trace gets a fold that costs a single line whatever the
 * run produced.
 */
export function MissionTimeline({ events, renderDecision }: MissionTimelineProps) {
  const rows = buildTimeline(events);

  if (!rows.length) {
    return <p className="mission-empty">Aucun événement sous cette lentille.</p>;
  }

  return (
    <div className="mission-timeline">
      {rows.map((row, index) => {
        const previous = rows[index - 1];
        const at = row.type === "trace" ? row.from : row.event.at;
        const previousAt = !previous
          ? null
          : previous.type === "trace"
            ? previous.to
            : previous.event.at;
        const showDay = !previousAt || !isSameDay(previousAt, at);
        return (
          <div key={row.key}>
            {showDay ? <p className="mission-day">{formatDay(at)}</p> : null}
            <Row row={row} renderDecision={renderDecision} />
          </div>
        );
      })}
    </div>
  );
}

function Row({
  row,
  renderDecision,
}: {
  row: TimelineRow;
  renderDecision?: MissionTimelineProps["renderDecision"];
}) {
  if (row.type === "trace") return <TraceFold row={row} />;
  if (row.event.noise === "decision" && renderDecision) {
    return <>{renderDecision(row.event)}</>;
  }
  return <Fact event={row.event} />;
}

function Fact({ event }: { event: MissionEvent }) {
  return (
    <article className="mission-fact">
      <time className="mission-fact__time" dateTime={event.at}>
        {formatTime(event.at)}
      </time>
      <p className="mission-fact__body">
        <span className="mission-fact__actor" data-kind={event.actor.kind}>
          {event.actor.id}
        </span>
        {event.title}
        {event.detail ? (
          <span className="mission-fact__detail"> · {event.detail}</span>
        ) : null}
        {event.value ? (
          <>
            {" "}
            <code className="mission-fact__value">{event.value}</code>
          </>
        ) : null}
      </p>
    </article>
  );
}

/* A run can produce hundreds of calls; opening the fold must not pay for all
   of them at once. Twenty rows show, a sentinel at the bottom of the list
   pulls the next twenty each time the scroll reaches it. */
const TRACE_PAGE = 20;

function TraceFold({ row }: { row: Extract<TimelineRow, { type: "trace" }> }) {
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(TRACE_PAGE);
  const sentinel = useRef<HTMLDivElement>(null);
  const count = row.events.length;

  useEffect(() => {
    if (!open || limit >= count) return;
    const node = sentinel.current;
    if (!node) return;
    // The list scrolls in place, so its own scrollport is the root — against
    // the viewport the sentinel could sit below the fold and never intersect.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setLimit((current) => current + TRACE_PAGE);
        }
      },
      { root: node.parentElement },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [open, limit, count]);

  return (
    <div className="mission-trace">
      <button
        type="button"
        className="mission-trace__summary"
        aria-expanded={open}
        onClick={() =>
          setOpen((current) => {
            if (current) setLimit(TRACE_PAGE);
            return !current;
          })
        }
      >
        <time className="mission-fact__time" dateTime={row.from}>
          {formatTime(row.from)}
        </time>
        <span className="mission-trace__label">
          {open ? (
            <ChevronDownIcon size={14} aria-hidden="true" />
          ) : (
            <ChevronRightIcon size={14} aria-hidden="true" />
          )}
          <ActorName actor={row.actor} />
          <span className="mission-trace__count">{count}</span>
          <span>
            {count > 1 ? "appels d'outils" : "appel d'outil"} entre{" "}
            {formatTime(row.from)} et {formatTime(row.to)}
          </span>
        </span>
      </button>
      {open ? (
        <div className="mission-trace__list">
          {row.events.slice(0, limit).map((event) => (
            <div className="mission-trace__row" key={event.id}>
              <time className="mission-fact__time" dateTime={event.at}>
                {formatTime(event.at)}
              </time>
              <span>{event.title}</span>
              {event.value ? <code>{event.value}</code> : <span />}
            </div>
          ))}
          {limit < count ? (
            <div ref={sentinel} aria-hidden="true" className="mission-trace__sentinel" />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ActorName({ actor }: { actor: MissionActor }) {
  return (
    <span className="mission-fact__actor" data-kind={actor.kind}>
      {actor.id}
    </span>
  );
}
