import { useState } from "react";
import { ArrowLeft, Check, ChevronDown, Clock3, Laptop, ListChecks, ShieldCheck, TerminalSquare } from "lucide-react";
import { Button } from "../../components/ui/button";
import { type MockGuidedTask, type MockPlanIcon } from "../../data";

function PlanIcon({ icon }: { icon: MockPlanIcon }) {
  if (icon === "shield") return <ShieldCheck size={20} />;
  if (icon === "build") return <Laptop size={20} />;
  return <ListChecks size={20} />;
}

export function PlanPage({ task, back, next }: { task: MockGuidedTask; back: () => void; next: () => void }) {
  const [technical, setTechnical] = useState(false);

  return (
    <section className="stage-panel" aria-labelledby="plan-title">
      <button className="back-link" type="button" onClick={back}><ArrowLeft size={17} /> Revoir la compréhension</button>
      <div className="eyebrow"><ListChecks size={16} /> Plan proposé</div>
      <h1 id="plan-title">{task.planHeading}</h1>
      <p className="lead">Priorité {task.priorityOption.label.toLowerCase()}. Le plan reste modifiable et la réalisation commencera uniquement après votre accord.</p>

      <ol className="plan-list">
        {task.planItems.map((item, index) => (
          <li key={item.id}>
            <span className="plan-number">{index + 1}</span>
            <span className="plan-icon"><PlanIcon icon={item.icon} /></span>
            <span className="plan-copy"><strong>{item.title}</strong><small>{item.detail}</small></span>
            <span className="time-chip"><Clock3 size={14} /> {item.days} j</span>
          </li>
        ))}
      </ol>

      <button className="technical-toggle" type="button" aria-expanded={technical} onClick={() => setTechnical(!technical)}>
        <span><TerminalSquare size={18} /> Détails techniques</span>
        <ChevronDown size={18} className={technical ? "rotated" : ""} />
      </button>
      {technical && (
        <div className="technical-details">
          <span>Branche isolée</span><code>{task.branchName}</code>
          <span>Vérifications</span><code>typecheck · tests · build · a11y</code>
        </div>
      )}

      <div className="validation-note"><ShieldCheck size={21} /><span><strong>Décision attendue</strong>Vous gardez la main avant la première modification.</span></div>
      <div className="decision-row">
        <Button variant="secondary" onClick={back}>Demander un ajustement</Button>
        <Button onClick={next}>Valider le plan <Check size={19} /></Button>
      </div>
    </section>
  );
}
