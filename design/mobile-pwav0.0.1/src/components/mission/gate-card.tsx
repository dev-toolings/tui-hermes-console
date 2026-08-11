import { CheckIcon, ShieldAlertIcon, ShieldCheckIcon, XIcon } from "lucide-react";
import type { GateDecision, MissionEvent } from "../../state/mission-events";
import { formatTime } from "../../state/mission-events";

export type GateCardProps = {
  gate: MissionEvent;
  decision: GateDecision;
  onDecide: (decision: Exclude<GateDecision, "pending">) => void;
};

/**
 * An authorization gate. While it is pending it stays pinned at the top of the
 * mission and cannot be dismissed, collapsed or marked as read: an operator has
 * to answer it. Once answered it drops out of the sticky position and stays in
 * the timeline as the audit record of who decided what.
 */
export function GateCard({ gate, decision, onDecide }: GateCardProps) {
  const radius = gate.blastRadius;
  const pending = decision === "pending";
  const danger = pending && Boolean(radius?.irreversible);

  return (
    <section
      className={`mission-gate ${danger ? "mission-gate--danger" : ""} ${pending ? "" : "mission-gate--settled"}`}
      aria-labelledby={`${gate.id}-title`}
    >
      <p className="mission-gate__eyebrow">
        {pending ? (
          <ShieldAlertIcon size={14} aria-hidden="true" />
        ) : (
          <ShieldCheckIcon size={14} aria-hidden="true" />
        )}
        {pending
          ? "Autorisation requise"
          : decision === "approved"
            ? "Autorisée"
            : "Refusée"}
        <span aria-hidden="true">·</span>
        <span>{formatTime(gate.at)}</span>
      </p>

      <h2 className="mission-gate__title" id={`${gate.id}-title`}>
        {gate.title}
      </h2>
      {gate.detail ? <p className="mission-gate__detail">{gate.detail}</p> : null}

      {radius ? (
        <dl className="mission-gate__radius">
          <div>
            <dt>Portée</dt>
            <dd>{radius.environment}</dd>
          </div>
          <div>
            <dt>Fichiers</dt>
            <dd>{radius.files}</dd>
          </div>
          <div>
            <dt>Lignes</dt>
            <dd>
              +{radius.added} / −{radius.removed.toLocaleString("fr-FR")}
            </dd>
          </div>
          <div>
            <dt>Réversible</dt>
            <dd>{radius.irreversible ? "non" : "oui"}</dd>
          </div>
        </dl>
      ) : null}

      {pending ? (
        <>
          <div className="mission-gate__actions">
            <button type="button" className="is-approve" onClick={() => onDecide("approved")}>
              <CheckIcon size={15} aria-hidden="true" />
              Autoriser
            </button>
            <button type="button" className="is-refuse" onClick={() => onDecide("refused")}>
              <XIcon size={15} aria-hidden="true" />
              Refuser
            </button>
          </div>
          {radius?.irreversible ? (
            <p className="mission-gate__note">
              Cette opération est irréversible sur {radius.environment}. Elle ne
              peut pas être annulée après autorisation.
            </p>
          ) : null}
        </>
      ) : (
        <p className="mission-gate__note">
          Décision enregistrée localement dans cette maquette, sans effet sur un
          runtime réel.
        </p>
      )}
    </section>
  );
}
