import { ArrowRight, ChevronDown, Paperclip, ShieldCheck, Sparkles, X } from "lucide-react";
import { Button } from "../../components/ui/button";
import { IconButton } from "../../components/ui/icon-button";
import { mockProjectCatalog, type MockGuidedTask, type MockPriority } from "../../data";

export function RequestPage({ task, onChange, next }: { task: MockGuidedTask; onChange: (task: MockGuidedTask) => void; next: () => void }) {
  return (
    <section className="stage-panel" aria-labelledby="request-title">
      <div className="eyebrow"><Sparkles size={16} /> Nouvelle tâche</div>
      <h1 id="request-title">Qu’est-ce qui doit être livré&nbsp;?</h1>
      <p className="lead">Décrivez le résultat attendu avec vos mots. Hermes préparera un plan avant toute réalisation.</p>

      <span className="field-label">Votre demande</span>
      <div className="request-box">
        <textarea
          value={task.request}
          rows={4}
          maxLength={600}
          inputMode="text"
          enterKeyHint="next"
          aria-label="Votre demande"
          placeholder="Décrivez le résultat attendu…"
          onChange={(event) => onChange(task.withRequest(event.target.value))}
        />
        <div className="request-actions">
          <span>{task.characterCount} caractères{task.attachments.length > 0 ? ` · ${task.attachments.length} pièce${task.attachments.length > 1 ? "s" : ""} jointe${task.attachments.length > 1 ? "s" : ""}` : ""}</span>
          <div>
            <IconButton label="Joindre un document mock" disabled={task.attachments.length >= 2} onClick={() => onChange(task.attachNextMockFile())}><Paperclip size={19} /></IconButton>
            <IconButton label="Effacer la demande" disabled={task.request.length === 0} onClick={() => onChange(task.clearRequest())}><X size={19} /></IconButton>
          </div>
        </div>
      </div>

      <div className="scope-row">
        <div>
          <span className="field-label">Projet</span>
          <div className="select-shell">
            <select className="select-control" value={task.projectId} aria-label="Projet" onChange={(event) => onChange(task.withProject(event.target.value))}>
              {mockProjectCatalog.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
            <ChevronDown size={17} aria-hidden="true" />
          </div>
        </div>
        <div>
          <span className="field-label">Priorité</span>
          <div className="select-shell">
            <select className="select-control" value={task.priority} aria-label="Priorité" onChange={(event) => onChange(task.withPriority(event.target.value as MockPriority))}>
              {mockProjectCatalog.priorities.map((priority) => <option key={priority.id} value={priority.id}>{priority.label}</option>)}
            </select>
            <ChevronDown size={17} aria-hidden="true" />
          </div>
        </div>
      </div>

      <Button className="full-width-action" disabled={!task.canContinue} onClick={next}>Vérifier ma demande <ArrowRight size={19} /></Button>
      <p className="assurance"><ShieldCheck size={16} /> Rien ne sera exécuté sans votre validation.</p>
    </section>
  );
}
