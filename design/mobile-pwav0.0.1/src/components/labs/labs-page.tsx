import { Link } from "react-router";
import { ArrowRightIcon, FlaskConicalIcon } from "lucide-react";
import { useApp } from "../../App";
import { orgPath } from "../mobile/mobile-nav";
import { formatDay } from "../../state/mission-events";
import {
  EXPERIMENTS,
  isExperimentEnabled,
  setExperimentEnabled,
  trainingProgressFor,
  type LabsExperiment,
} from "../../state/labs-store";
import { EXPECTED_DECISIONS, correctDecisionCount } from "../../state/labs-training";
import { useLabsState } from "./use-labs-state";
import "../../styles/labs.css";

/**
 * Labs: the console's opt-in experiments, one card per experiment, enabled per
 * workspace. Turning an experiment on or off is a governed act like any other:
 * it lands in the workspace audit log.
 */
export function LabsPage() {
  const { activeWorkspace, logAudit } = useApp();
  const [labs, update] = useLabsState();
  const workspaceId = activeWorkspace.id;

  const toggle = (experiment: LabsExperiment) => {
    const enabled = !isExperimentEnabled(labs, workspaceId, experiment.id);
    update((state) => setExperimentEnabled(state, workspaceId, experiment.id, enabled));
    logAudit(
      `Expérience « ${experiment.title} » ${enabled ? "activée" : "désactivée"}`,
    );
  };

  const trainingStatus = () => {
    const progress = trainingProgressFor(labs, workspaceId);
    if (progress.graduatedAt) return `Diplômé le ${formatDay(progress.graduatedAt)}`;
    if (Object.keys(progress.decisions).length === 0) return "Jamais commencé";
    const total = Object.keys(EXPECTED_DECISIONS).length;
    return `En cours · ${correctDecisionCount(progress)}/${total}`;
  };

  return (
    <div className="labs-page">
      <header className="labs-head">
        <span className="labs-head__eyebrow">
          <FlaskConicalIcon size={12} aria-hidden="true" />
          labs
        </span>
        <h1>Labs</h1>
        <p>
          Des expériences de la console à activer par workspace. Rien n'est
          engagé par défaut, et chaque activation est consignée au journal
          d'audit.
        </p>
      </header>

      <div className="labs-grid">
        {EXPERIMENTS.map((experiment) => {
          const enabled = isExperimentEnabled(labs, workspaceId, experiment.id);
          return (
            <section
              key={experiment.id}
              className="labs-card"
              aria-labelledby={`labs-${experiment.id}-title`}
            >
              <header className="labs-card__head">
                <h2 id={`labs-${experiment.id}-title`}>{experiment.title}</h2>
                <span className="labs-card__badge" data-tone={experiment.tone}>
                  {experiment.statusLabel}
                </span>
              </header>
              <p className="labs-card__description">{experiment.description}</p>
              {experiment.id === "training" ? (
                <p className="labs-card__state">{trainingStatus()}</p>
              ) : null}
              <div className="labs-card__actions">
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  aria-label={`Activer « ${experiment.title} »`}
                  className="labs-switch"
                  onClick={() => toggle(experiment)}
                >
                  <span className="labs-switch__track" aria-hidden="true">
                    <span className="labs-switch__thumb" />
                  </span>
                  {enabled ? "Activée" : "Désactivée"}
                </button>
                {enabled ? (
                  <Link
                    className="labs-card__open"
                    to={orgPath(activeWorkspace.id, experiment.path)}
                  >
                    Ouvrir
                    <ArrowRightIcon size={14} aria-hidden="true" />
                  </Link>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
