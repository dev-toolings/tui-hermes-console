import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  LayoutGridIcon,
  ShieldAlertIcon,
} from "lucide-react";
import { GateCard } from "./gate-card";
import { MissionTimeline } from "./mission-timeline";
import {
  LENSES,
  MISSIONS,
  eventsForMission,
  filterByLens,
  formatTime,
  pendingGates,
  type EventLens,
  type GateDecision,
  type MissionEvent,
} from "../../state/mission-events";
import "../../styles/mission.css";
import "../../styles/layout-lab.css";

/**
 * Ten distinct arrangements of the same mission surface, composed exclusively
 * from the existing components (GateCard, MissionTimeline, lenses, fixtures).
 * A floating switcher cycles through them; the chosen scene and the gate
 * decisions survive a reload so a comparison session keeps its state.
 */

const LAYOUTS = [
  {
    id: "console",
    name: "1 · Console trois colonnes",
    intent: "La proposition de référence : liste, mission, contexte d'exécution.",
  },
  {
    id: "focus",
    name: "2 · Focus décision",
    intent: "Une colonne de 720px, la gate d'abord, rien d'autre à l'écran.",
  },
  {
    id: "double",
    name: "3 · Double vérité",
    intent: "Échanges à gauche, exécution à droite, la gate ponte les deux.",
  },
  {
    id: "cockpit",
    name: "4 · Cockpit",
    intent: "La gate aplatie en bandeau de contrôle, l'audit en marge.",
  },
  {
    id: "master",
    name: "5 · Master-detail",
    intent: "Les missions à gauche, la mission ouverte à droite, façon mail.",
  },
  {
    id: "organe",
    name: "6 · Organe mobile",
    intent: "La scène B2C : le téléphone qui ne sert qu'à trancher.",
  },
  {
    id: "dock",
    name: "7 · Barre basse",
    intent: "La timeline respire, la gate est ancrée en bas comme un composer.",
  },
  {
    id: "journal",
    name: "8 · Journal",
    intent: "Colonne de lecture 66ch, lentilles en rail de marge, jours marqués.",
  },
  {
    id: "acteurs",
    name: "9 · Par acteur",
    intent: "Humains, agents, système : trois colonnes, trois responsabilités.",
  },
  {
    id: "bento",
    name: "10 · Bento",
    intent: "La mission comme dashboard : gate, chiffres, flux compacté.",
  },
] as const;

type LayoutId = (typeof LAYOUTS)[number]["id"];

const STORAGE_KEY = "hermes-layout-lab";
const MISSION_ID = "purge-worker";

export function LayoutLabPage() {
  const [layoutId, setLayoutId] = useState<LayoutId>(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return LAYOUTS.some((layout) => layout.id === stored)
      ? (stored as LayoutId)
      : "console";
  });
  const [decisions, setDecisions] = useState<Record<string, GateDecision>>({});
  const [lens, setLens] = useState<EventLens>("all");

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, layoutId);
  }, [layoutId]);

  const events = useMemo(() => eventsForMission(MISSION_ID), []);
  const visible = useMemo(() => filterByLens(events, lens), [events, lens]);
  const decisionOf = (gate: MissionEvent) =>
    decisions[gate.id] ?? gate.decision ?? "pending";
  const pending = pendingGates(events).filter(
    (gate) => decisionOf(gate) === "pending",
  );
  const decide = (gate: MissionEvent) => (decision: Exclude<GateDecision, "pending">) =>
    setDecisions((current) => ({ ...current, [gate.id]: decision }));

  const layout = LAYOUTS.find((entry) => entry.id === layoutId) ?? LAYOUTS[0];
  const scene: SceneProps = {
    events,
    visible,
    pending,
    lens,
    setLens,
    decisionOf,
    decide,
  };

  return (
    <div className="lab-page mission-page">
      <header className="lab-head">
        <span className="lab-head__eyebrow">
          <LayoutGridIcon size={12} aria-hidden="true" />
          layout lab
        </span>
        <h1>{layout.name}</h1>
        <p>{layout.intent}</p>
      </header>
      <div className="lab-stage" key={layout.id}>
        <Scene layoutId={layout.id} {...scene} />
      </div>
      <LabSwitch layoutId={layout.id} onChange={setLayoutId} />
    </div>
  );
}

type SceneProps = {
  events: MissionEvent[];
  visible: MissionEvent[];
  pending: MissionEvent[];
  lens: EventLens;
  setLens: (lens: EventLens) => void;
  decisionOf: (gate: MissionEvent) => GateDecision;
  decide: (gate: MissionEvent) => (decision: Exclude<GateDecision, "pending">) => void;
};

function Scene({ layoutId, ...props }: SceneProps & { layoutId: LayoutId }) {
  switch (layoutId) {
    case "console":
      return <ConsoleScene {...props} />;
    case "focus":
      return <FocusScene {...props} />;
    case "double":
      return <DoubleScene {...props} />;
    case "cockpit":
      return <CockpitScene {...props} />;
    case "master":
      return <MasterScene {...props} />;
    case "organe":
      return <PhoneScene {...props} />;
    case "dock":
      return <DockScene {...props} />;
    case "journal":
      return <JournalScene {...props} />;
    case "acteurs":
      return <ActorsScene {...props} />;
    case "bento":
      return <BentoScene {...props} />;
  }
}

/** Shared bits ------------------------------------------------------------ */

function Gates({
  pending,
  decisionOf,
  decide,
}: Pick<SceneProps, "pending" | "decisionOf" | "decide">) {
  return (
    <>
      {pending.map((gate) => (
        <GateCard
          key={gate.id}
          gate={gate}
          decision={decisionOf(gate)}
          onDecide={decide(gate)}
        />
      ))}
    </>
  );
}

function Lenses({ lens, setLens }: Pick<SceneProps, "lens" | "setLens">) {
  return (
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
  );
}

function Timeline({
  visible,
  decisionOf,
  decide,
}: Pick<SceneProps, "visible" | "decisionOf" | "decide">) {
  return (
    <MissionTimeline
      events={visible}
      renderDecision={(event) => {
        const decision = decisionOf(event);
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
                Autorisation en attente, traitée dans la carte épinglée
                <ArrowUpIcon
                  size={13}
                  aria-hidden="true"
                  className="ml-1 inline align-[-1px] text-[var(--muted-foreground)]"
                />
              </span>
            </p>
          );
        }
        return <GateCard gate={event} decision={decision} onDecide={decide(event)} />;
      }}
    />
  );
}

function MissionList() {
  return (
    <section className="mobile-list" aria-label="Missions">
      {MISSIONS.map((mission) => {
        const count = eventsForMission(mission.id).length;
        const gates = pendingGates(eventsForMission(mission.id)).length;
        return (
          <div
            key={mission.id}
            className={`mobile-row ${mission.id === MISSION_ID ? "mobile-row--current" : ""}`}
          >
            <span className="mobile-row__body">
              <span className="mobile-row__title">{mission.name}</span>
              <span className="mobile-row__detail">
                {mission.agent} · {count} événements
              </span>
            </span>
            {gates ? <span className="mobile-badge">{gates}</span> : null}
          </div>
        );
      })}
    </section>
  );
}

/** 1. Console trois colonnes ---------------------------------------------- */

function ConsoleScene(props: SceneProps) {
  const context = filterByLens(props.events, "exec").filter(
    (event) => event.noise !== "trace",
  );
  return (
    <div className="lab-l1">
      <aside className="lab-panel">
        <h2>Missions</h2>
        <MissionList />
      </aside>
      <div className="mission-page">
        <Gates {...props} />
        <Lenses {...props} />
        <Timeline {...props} />
      </div>
      <aside className="lab-panel">
        <h2>Contexte d'exécution</h2>
        <MissionTimeline events={context} />
      </aside>
    </div>
  );
}

/** 2. Focus décision -------------------------------------------------------- */

function FocusScene(props: SceneProps) {
  return (
    <div className="lab-l2 mission-page">
      <Gates {...props} />
      <Lenses {...props} />
      <Timeline {...props} />
    </div>
  );
}

/** 3. Double vérité --------------------------------------------------------- */

function DoubleScene(props: SceneProps) {
  return (
    <div className="lab-l3">
      <div className="lab-l3__gate mission-page">
        <Gates {...props} />
      </div>
      <section className="lab-panel">
        <h2>Échanges</h2>
        <MissionTimeline events={filterByLens(props.events, "talk")} />
      </section>
      <section className="lab-panel">
        <h2>Exécution</h2>
        <MissionTimeline events={filterByLens(props.events, "exec")} />
      </section>
    </div>
  );
}

/** 4. Cockpit ---------------------------------------------------------------- */

function CockpitScene(props: SceneProps) {
  const audit = filterByLens(props.events, "audit");
  return (
    <div className="lab-l4">
      <div className="lab-band mission-page">
        <Gates {...props} />
      </div>
      <div className="mission-page">
        <Lenses {...props} />
        <Timeline {...props} />
      </div>
      <aside className="lab-panel">
        <h2>Audit</h2>
        {audit.length ? (
          <MissionTimeline
            events={audit}
            renderDecision={(event) => (
              <p className="mission-fact">
                <time className="mission-fact__time" dateTime={event.at}>
                  {formatTime(event.at)}
                </time>
                <span className="mission-fact__body">
                  <span className="mission-fact__actor" data-kind={event.actor.kind}>
                    {event.actor.id}
                  </span>
                  {event.title}
                </span>
              </p>
            )}
          />
        ) : (
          <p className="mission-empty">Aucun événement d'audit.</p>
        )}
      </aside>
    </div>
  );
}

/** 5. Master-detail ---------------------------------------------------------- */

function MasterScene(props: SceneProps) {
  return (
    <div className="lab-l5">
      <aside className="lab-panel">
        <h2>File des missions</h2>
        <MissionList />
      </aside>
      <div className="mission-page">
        <Gates {...props} />
        <Lenses {...props} />
        <Timeline {...props} />
      </div>
    </div>
  );
}

/** 6. Organe mobile ----------------------------------------------------------- */

function PhoneScene(props: SceneProps) {
  return (
    <div className="lab-l6">
      <div className="lab-phone">
        <div className="lab-phone__status" aria-hidden="true">
          <span />
        </div>
        <div className="lab-phone__scroll mission-page">
          <Gates {...props} />
          <Timeline
            visible={filterByLens(props.visible, "talk")}
            decisionOf={props.decisionOf}
            decide={props.decide}
          />
        </div>
      </div>
    </div>
  );
}

/** 7. Barre basse -------------------------------------------------------------- */

function DockScene(props: SceneProps) {
  return (
    <div className="lab-l7">
      <div className="mission-page">
        <Lenses {...props} />
        <Timeline {...props} />
      </div>
      <div className="lab-dock mission-page">
        <Gates {...props} />
      </div>
    </div>
  );
}

/** 8. Journal ------------------------------------------------------------------- */

function JournalScene(props: SceneProps) {
  return (
    <div className="lab-l8">
      <aside className="lab-l8__rail">
        <Lenses {...props} />
      </aside>
      <div className="lab-l8__body mission-page">
        <Gates {...props} />
        <Timeline {...props} />
      </div>
    </div>
  );
}

/** 9. Par acteur ------------------------------------------------------------------ */

function ActorsScene(props: SceneProps) {
  const columns: Array<{ kind: MissionEvent["actor"]["kind"]; label: string }> = [
    { kind: "human", label: "Humains" },
    { kind: "agent", label: "Agents" },
    { kind: "system", label: "Système" },
  ];
  return (
    <div className="mission-page" style={{ gap: 12 }}>
      <Gates {...props} />
      <div className="lab-l9">
        {columns.map((column) => {
          const events = props.events.filter(
            (event) => event.actor.kind === column.kind && event.kind !== "gate",
          );
          return (
            <section className="lab-panel" key={column.kind}>
              <h2>{column.label}</h2>
              {events.length ? (
                <MissionTimeline events={events} />
              ) : (
                <p className="mission-empty">Aucun événement.</p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** 10. Bento ------------------------------------------------------------------------ */

function BentoScene(props: SceneProps) {
  const count = (predicate: (event: MissionEvent) => boolean) =>
    props.events.filter(predicate).length;
  const stats = [
    { label: "Événements", value: props.events.length },
    { label: "Appels d'outils", value: count((event) => event.kind === "tool") },
    { label: "Messages humains", value: count((event) => event.actor.kind === "human") },
    { label: "Décisions en attente", value: props.pending.length },
  ];
  const artifacts = props.events.filter(
    (event) => event.kind === "artifact" || event.kind === "patch",
  );
  return (
    <div className="lab-l10">
      <div className="lab-l10__gate mission-page">
        <Gates {...props} />
      </div>
      <section className="lab-panel">
        <h2>Mesures</h2>
        <dl className="lab-stats">
          {stats.map((stat) => (
            <div className="lab-stat" key={stat.label}>
              <dt>{stat.label}</dt>
              <dd>{stat.value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <div className="lab-l10__timeline lab-panel">
        <h2>Flux</h2>
        <Lenses {...props} />
        <Timeline {...props} />
      </div>
      <section className="lab-panel">
        <h2>Artefacts</h2>
        {artifacts.length ? (
          <MissionTimeline events={artifacts} />
        ) : (
          <p className="mission-empty">Aucun artefact.</p>
        )}
      </section>
    </div>
  );
}

/** Switcher -------------------------------------------------------------------------- */

function LabSwitch({
  layoutId,
  onChange,
}: {
  layoutId: LayoutId;
  onChange: (id: LayoutId) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const index = LAYOUTS.findIndex((layout) => layout.id === layoutId);
  const step = (delta: number) =>
    onChange(LAYOUTS[(index + delta + LAYOUTS.length) % LAYOUTS.length].id);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") setOpen(false);
        return;
      }
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <>
      {open ? (
        <div className="lab-switch__menu" ref={menuRef} role="menu" aria-label="Choisir un layout">
          {LAYOUTS.map((layout) => (
            <button
              key={layout.id}
              type="button"
              role="menuitem"
              aria-current={layout.id === layoutId}
              onClick={() => {
                onChange(layout.id);
                setOpen(false);
              }}
            >
              <span className="lab-switch__name">{layout.name}</span>
              <span className="lab-switch__desc">{layout.intent}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="lab-switch">
        <button
          type="button"
          className="lab-switch__arrow"
          aria-label="Layout précédent"
          onClick={() => step(-1)}
        >
          <ChevronLeftIcon size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="lab-switch__current"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <span className="lab-switch__index">
            {index + 1}/{LAYOUTS.length}
          </span>
          {LAYOUTS[index].name.replace(/^\d+ · /, "")}
        </button>
        <button
          type="button"
          className="lab-switch__arrow"
          aria-label="Layout suivant"
          onClick={() => step(1)}
        >
          <ChevronRightIcon size={16} aria-hidden="true" />
        </button>
      </div>
    </>
  );
}
