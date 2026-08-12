import { Link } from "react-router";
import { AwardIcon, FlaskConicalIcon, RotateCcwIcon } from "lucide-react";
import { useApp } from "../../App";
import { orgPath } from "../mobile/mobile-nav";
import { GateCard } from "../mission/gate-card";
import { MissionTimeline } from "../mission/mission-timeline";
import type { MissionEvent } from "../../state/mission-events";
import {
  clearTrainingDecision,
  isExperimentEnabled,
  markGraduated,
  recordTrainingDecision,
  resetTraining,
  setExperimentEnabled,
  trainingProgressFor,
  type TrainingDecision,
} from "../../state/labs-store";
import {
  PURGE_GATE_ID,
  STAGING_GATE_ID,
  TRAINING_MISSION,
  isGraduated,
  verdictFor,
  visibleTrainingEvents,
  type TrainingVerdict,
} from "../../state/labs-training";
import { useLabsState } from "./use-labs-state";
import "../../styles/mission.css";
import "../../styles/labs.css";

const STEPS = [
  { id: "read", label: "Lire la mission" },
  { id: "approve", label: "Autoriser la gate sûre" },
  { id: "refuse", label: "Refuser la gate piège" },
  { id: "graduate", label: "Diplôme" },
] as const;

function VerdictNote({
  verdict,
  onRetry,
}: {
  verdict: TrainingVerdict;
  onRetry: () => void;
}) {
  return (
    <div
      role="status"
      className={`labs-verdict ${verdict.correct ? "labs-verdict--right" : "labs-verdict--wrong"}`}
    >
      <p className="labs-verdict__title">{verdict.title}</p>
      <p className="labs-verdict__message">{verdict.message}</p>
      {!verdict.correct ? (
        <button type="button" className="labs-verdict__retry" onClick={onRetry}>
          <RotateCcwIcon size={14} aria-hidden="true" />
          Réessayer
        </button>
      ) : null}
    </div>
  );
}

/**
 * Terrain d'entraînement: a fictional mission where the trainee practices the
 * console's central gesture — reading a gate by its blast radius. Progress and
 * graduation persist locally; the trap gate cannot be reached before the safe
 * gate is decided correctly.
 */
export function TrainingPage() {
  const { activeWorkspace, logAudit } = useApp();
  const [labs, update] = useLabsState();
  const workspaceId = activeWorkspace.id;
  const enabled = isExperimentEnabled(labs, workspaceId, "training");
  const progress = trainingProgressFor(labs, workspaceId);
  const events = visibleTrainingEvents(progress);
  const graduated = isGraduated(progress);
  const labsHome = orgPath(activeWorkspace.id, "/labs");

  const enable = () => {
    update((state) => setExperimentEnabled(state, workspaceId, "training", true));
    logAudit("Expérience « Terrain d'entraînement » activée");
  };

  const decide = (gateId: string) => (decision: TrainingDecision) => {
    const before = trainingProgressFor(labs, workspaceId);
    const willGraduate =
      !before.graduatedAt &&
      isGraduated({ ...before, decisions: { ...before.decisions, [gateId]: decision } });
    update((state) => {
      let next = recordTrainingDecision(state, workspaceId, gateId, decision);
      if (isGraduated(trainingProgressFor(next, workspaceId))) {
        next = markGraduated(next, workspaceId, new Date().toISOString());
      }
      return next;
    });
    if (willGraduate) logAudit("Terrain d'entraînement : diplôme obtenu");
  };

  const retry = (gateId: string) =>
    update((state) => clearTrainingDecision(state, workspaceId, gateId));
  const restart = () => update((state) => resetTraining(state, workspaceId));

  if (!enabled) {
    return (
      <div className="labs-page">
        <section className="labs-card labs-card--guard" aria-labelledby="labs-training-guard">
          <header className="labs-card__head">
            <h2 id="labs-training-guard">Terrain d'entraînement</h2>
            <span className="labs-card__badge" data-tone="warn">
              expérimental
            </span>
          </header>
          <p className="labs-card__description">
            Cette expérience est désactivée dans ce workspace. L'activer la
            consigne au journal d'audit, comme toute décision.
          </p>
          <div className="labs-card__actions">
            <button type="button" className="labs-verdict__retry" onClick={enable}>
              <FlaskConicalIcon size={14} aria-hidden="true" />
              Activer l'expérience
            </button>
            <Link className="labs-card__open" to={labsHome}>
              Retour aux Labs
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const stepDone = (id: (typeof STEPS)[number]["id"]) => {
    if (id === "read") return Object.keys(progress.decisions).length > 0;
    if (id === "approve") return progress.decisions[STAGING_GATE_ID] === "approved";
    if (id === "refuse") return progress.decisions[PURGE_GATE_ID] === "refused";
    return graduated;
  };
  const currentStep = STEPS.find((step) => !stepDone(step.id))?.id ?? "graduate";

  const renderDecision = (event: MissionEvent) => {
    const recorded: TrainingDecision | undefined = progress.decisions[event.id];
    const verdict = recorded ? verdictFor(event.id, recorded) : null;
    return (
      <GateCard
        gate={event}
        decision={recorded ?? "pending"}
        onDecide={decide(event.id)}
        settledNote={
          verdict ? (
            <VerdictNote verdict={verdict} onRetry={() => retry(event.id)} />
          ) : undefined
        }
      />
    );
  };

  return (
    <div className="labs-page labs-training mission-page">
      <header className="labs-head">
        <span className="labs-head__eyebrow">
          <FlaskConicalIcon size={12} aria-hidden="true" />
          labs · entraînement
        </span>
        <h1>{TRAINING_MISSION.name}</h1>
        <p>{TRAINING_MISSION.intent}</p>
      </header>

      <ol className="labs-steps" aria-label="Progression de l'entraînement">
        {STEPS.map((step) => (
          <li
            key={step.id}
            className={stepDone(step.id) ? "is-done" : ""}
            aria-current={step.id === currentStep ? "step" : undefined}
          >
            {step.label}
          </li>
        ))}
      </ol>

      {graduated ? (
        <section className="labs-diploma" aria-labelledby="labs-diploma-title">
          <p className="labs-diploma__eyebrow">
            <AwardIcon size={14} aria-hidden="true" />
            Diplôme
          </p>
          <h2 id="labs-diploma-title">Tu sais lire une gate.</h2>
          <p>
            Gate sûre autorisée, gate piège refusée : la portée a primé sur le
            titre les deux fois. C'est exactement le geste attendu sur une
            mission réelle.
          </p>
          <div className="labs-card__actions">
            <button type="button" className="labs-verdict__retry" onClick={restart}>
              <RotateCcwIcon size={14} aria-hidden="true" />
              Recommencer
            </button>
            <Link className="labs-card__open" to={labsHome}>
              Retour aux Labs
            </Link>
          </div>
        </section>
      ) : null}

      <MissionTimeline events={events} renderDecision={renderDecision} />
    </div>
  );
}
