import { ArrowLeft, ArrowRight, Check, FileText, MessageSquareText } from "lucide-react";
import { Button } from "../../components/ui/button";
import { type MockGuidedTask } from "../../data";

export function UnderstandingPage({ task, back, next }: { task: MockGuidedTask; back: () => void; next: () => void }) {
  return (
    <section className="stage-panel" aria-labelledby="understanding-title">
      <button className="back-link" type="button" onClick={back}><ArrowLeft size={17} /> Modifier la demande</button>
      <div className="eyebrow"><MessageSquareText size={16} /> Reformulation</div>
      <h1 id="understanding-title">Voici ce que j’ai compris</h1>
      <p className="lead">Vérifiez le périmètre avant de préparer la réalisation.</p>

      <div className="summary-block">
        <div className="summary-heading">
          <span className="summary-icon"><FileText size={21} /></span>
          <div><strong>{task.summaryTitle}</strong><span>{task.project.name} · {task.priorityOption.label}</span></div>
        </div>
        <p>{task.summary}</p>
      </div>

      <div className="understood-grid">
        <div className="plain-group">
          <h2>Inclus</h2>
          <ul className="check-list">
            {task.included.map((item) => <li key={item}><Check size={17} /> {item}</li>)}
          </ul>
        </div>
        <div className="plain-group muted-group">
          <h2>Hors périmètre</h2>
          <ul className="dash-list">
            {task.excluded.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </div>

      <div className="decision-row">
        <Button variant="secondary" onClick={back}>À corriger</Button>
        <Button onClick={next}>C’est exact <ArrowRight size={19} /></Button>
      </div>
    </section>
  );
}
