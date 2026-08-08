import { CheckCircle2, CircleUserRound, FileText, History, Home, LoaderCircle, Menu, MoreHorizontal, Plus, ShieldCheck, Wifi, Zap } from "lucide-react";
import { nextStage, previousStage, type Stage } from "@hermes-console/guided-flow";
import { type DevicePreset } from "@hermes-console/device-kit";
import { IconButton } from "../ui/icon-button";
import { StageTracker } from "./stage-tracker";
import { RequestPage } from "../../pages/stages/request-page";
import { UnderstandingPage } from "../../pages/stages/understanding-page";
import { PlanPage } from "../../pages/stages/plan-page";
import { ProofPage } from "../../pages/stages/proof-page";
import { type MockDeliveryRun, type MockGuidedTask } from "../../data";

function EvidencePane({ task, run }: { task: MockGuidedTask; run: MockDeliveryRun }) {
  return (
    <aside className="evidence-pane" aria-label="Preuves de la tâche">
      <div className="pane-heading"><div><span>Preuves</span><strong>État vérifiable</strong></div><IconButton label="Plus d’options"><MoreHorizontal size={19} /></IconButton></div>
      <div className="evidence-score"><span>{run.completedChecks}/{run.checks.length}</span><div><strong>Contrôles validés</strong><small>{run.isComplete ? "Relecture terminée" : "Relecture encore requise"}</small></div></div>
      <div className="evidence-divider" />
      <ul>
        {run.checks.map((check, index) => (
          <li key={check.id} className={check.state === "running" ? "pending" : ""}>
            {check.state === "done" ? <CheckCircle2 size={18} /> : <LoaderCircle size={18} />}
            <span><strong>{task.proofChecks[index]?.label ?? check.label}</strong><small>{check.id === "review" ? check.detail : (task.proofChecks[index]?.detail ?? check.detail)}</small></span>
          </li>
        ))}
      </ul>
      <button className="pane-button" type="button"><FileText size={17} /> Consulter le rapport</button>
      <div className="runtime-note"><Wifi size={16} /><span><strong>Hermes connecté</strong><small>Exécution isolée et tracée</small></span></div>
    </aside>
  );
}

function NavigationRail({ pendingValidations }: { pendingValidations: number }) {
  return (
    <aside className="navigation-rail" aria-label="Navigation large écran">
      <div className="rail-logo">H</div>
      <nav>
        <button className="active" type="button"><Plus size={19} /><span>Nouvelle tâche</span></button>
        <button type="button"><History size={19} /><span>Historique</span></button>
        <button type="button"><ShieldCheck size={19} /><span>Validations</span><em>{pendingValidations}</em></button>
      </nav>
      <button className="rail-account" type="button"><span>KM</span><small>Kevin</small></button>
    </aside>
  );
}

function BottomNavigation() {
  return (
    <div className="bottom-navigation-slot">
      <nav className="bottom-navigation" aria-label="Navigation principale">
        <button className="active" type="button" aria-current="page"><Home size={21} /><span>Accueil</span></button>
        <button type="button"><Plus size={21} /><span>Nouvelle</span></button>
        <button type="button"><History size={21} /><span>Historique</span></button>
        <button type="button"><CircleUserRound size={21} /><span>Compte</span></button>
      </nav>
    </div>
  );
}

type ProductScreenProps = {
  device: DevicePreset;
  dark: boolean;
  stage: Stage;
  navigateTo: (stage: Stage) => void;
  task: MockGuidedTask;
  run: MockDeliveryRun;
  onTaskChange: (task: MockGuidedTask) => void;
  onRunChange: (run: MockDeliveryRun) => void;
};

export function ProductScreen({ device, dark, stage, navigateTo, task, run, onTaskChange, onRunChange }: ProductScreenProps) {
  const previous = () => navigateTo(previousStage(stage));
  const next = () => navigateTo(nextStage(stage));

  return (
    <div className={`product-screen ${dark ? "dark" : ""}`}>
      <div className="system-bar" aria-hidden="true">
        <span>{device.platform === "ios" ? "9:41" : "14:32"}</span>
        <div><Wifi size={15} /><Zap size={15} fill="currentColor" /></div>
      </div>
      <header className="product-header">
        <div className="mobile-brand"><span>H</span><strong>Hermes</strong></div>
        <div className="task-status" aria-live="polite"><span /> {task.saveLabel}</div>
        <IconButton label="Ouvrir le menu"><Menu size={21} /></IconButton>
      </header>
      <div className="product-layout">
        <NavigationRail pendingValidations={run.checks.length - run.completedChecks} />
        <main className="task-canvas">
          <div className="task-heading-row">
            <div><span className="project-kicker">{task.project.name}</span><strong>{task.project.taskTitle}</strong></div>
            <span className="draft-chip">Brouillon guidé</span>
          </div>
          <StageTracker stage={stage} />
          <div className="stage-scroll">
            {stage === "request" && <RequestPage task={task} onChange={onTaskChange} next={next} />}
            {stage === "understanding" && <UnderstandingPage task={task} back={previous} next={next} />}
            {stage === "plan" && <PlanPage task={task} back={previous} next={next} />}
            {stage === "proof" && <ProofPage task={task} run={run} onChange={onRunChange} restart={() => { onRunChange(run.reset()); navigateTo("request"); }} />}
          </div>
        </main>
        <EvidencePane task={task} run={run} />
      </div>
      <BottomNavigation />
    </div>
  );
}
