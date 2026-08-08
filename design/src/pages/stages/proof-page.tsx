import { ArrowRight, Check, CheckCircle2, FileCheck2, LoaderCircle, RotateCcw } from "lucide-react";
import { Button } from "../../components/ui/button";
import { type MockDeliveryRun, type MockGuidedTask } from "../../data";

export function ProofPage({ task, run, onChange, restart }: { task: MockGuidedTask; run: MockDeliveryRun; onChange: (run: MockDeliveryRun) => void; restart: () => void }) {
  return (
    <section className="stage-panel proof-stage" aria-labelledby="proof-title">
      <div className="success-header">
        <span className="success-mark"><CheckCircle2 size={25} /></span>
        <div><span className="eyebrow">{run.isComplete ? "Réalisation vérifiée" : "Réalisation terminée"}</span><h1 id="proof-title">Le résultat «&nbsp;{task.project.taskTitle}&nbsp;» est prêt à {run.isComplete ? "valider" : "vérifier"}</h1></div>
      </div>
      <p className="lead">{run.isComplete ? "Tous les contrôles sont terminés. Vous pouvez maintenant ouvrir l’aperçu." : "Le résultat répond au plan validé. Une dernière relecture technique est en cours."}</p>

      <div className="progress-summary" aria-live="polite">
        <div><strong>{run.completedChecks} sur {run.checks.length}</strong><span>vérifications terminées</span></div>
        <span className="progress-value">{run.progress}&nbsp;%</span>
      </div>
      <div className="progress-track"><span style={{ width: `${run.progress}%` }} /></div>

      <ul className="proof-list">
        {run.checks.map((check, index) => (
          <li key={check.id}>
            <span className={check.state === "done" ? "proof-icon done" : "proof-icon running"}>
              {check.state === "done" ? <Check size={17} /> : <LoaderCircle size={17} />}
            </span>
            <span><strong>{task.proofChecks[index]?.label ?? check.label}</strong><small>{check.id === "review" ? check.detail : (task.proofChecks[index]?.detail ?? check.detail)}</small></span>
            {check.state === "done" && <button type="button" onClick={() => onChange(run.viewCheck(check.id))}>{run.isViewed(check.id) ? "Vu" : "Voir"}</button>}
          </li>
        ))}
      </ul>

      <button className={`preview-callout ${run.previewOpened ? "opened" : ""}`} type="button" onClick={() => onChange(run.openPreview())}>
        <FileCheck2 size={21} />
        <span><strong>{run.previewOpened ? "Aperçu ouvert" : "Aperçu disponible"}</strong><small>{run.previewOpened ? "La session de démonstration est maintenant active." : "Parcourez le résultat comme un client avant de décider."}</small></span>
        <ArrowRight size={18} />
      </button>

      <div className="decision-row">
        <Button variant="secondary" onClick={restart}><RotateCcw size={17} /> Rejouer</Button>
        {run.isComplete ? (
          <Button onClick={() => onChange(run.openPreview())}>{run.previewOpened ? "Aperçu ouvert" : "Ouvrir l’aperçu"} <ArrowRight size={19} /></Button>
        ) : (
          <Button onClick={() => onChange(run.completeReview())}>Terminer la relecture <Check size={19} /></Button>
        )}
      </div>
    </section>
  );
}
