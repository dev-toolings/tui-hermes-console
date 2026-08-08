import { mockProjectCatalog, type MockPriority } from "./mock-project-catalog";

export type MockPlanIcon = "shield" | "build" | "verify";

export type MockPlanItem = {
  id: string;
  icon: MockPlanIcon;
  title: string;
  detail: string;
  days: number;
};

export type MockProofCopy = {
  label: string;
  detail: string;
};

type MockGuidedTaskState = {
  request: string;
  projectId: string;
  priority: MockPriority;
  attachments: string[];
  revision: number;
};

const initialRequest = "Ajouter un espace client pour suivre les commandes, télécharger les factures et contacter le support.";
const mockAttachments = ["brief-espace-client.pdf", "wireframe-mobile.png"];

export class MockGuidedTask {
  readonly request: string;
  readonly projectId: string;
  readonly priority: MockPriority;
  readonly attachments: string[];
  readonly revision: number;

  private constructor(state: MockGuidedTaskState) {
    this.request = state.request;
    this.projectId = state.projectId;
    this.priority = state.priority;
    this.attachments = state.attachments;
    this.revision = state.revision;
  }

  static create(): MockGuidedTask {
    return new MockGuidedTask({ request: initialRequest, projectId: "acme-portal", priority: "normal", attachments: [], revision: 1 });
  }

  private update(patch: Partial<MockGuidedTaskState>): MockGuidedTask {
    return new MockGuidedTask({
      request: patch.request ?? this.request,
      projectId: patch.projectId ?? this.projectId,
      priority: patch.priority ?? this.priority,
      attachments: patch.attachments ?? this.attachments,
      revision: this.revision + 1,
    });
  }

  withRequest(request: string): MockGuidedTask {
    return this.update({ request });
  }

  withProject(projectId: string): MockGuidedTask {
    return this.update({ projectId });
  }

  withPriority(priority: MockPriority): MockGuidedTask {
    return this.update({ priority });
  }

  clearRequest(): MockGuidedTask {
    return this.update({ request: "" });
  }

  attachNextMockFile(): MockGuidedTask {
    const nextAttachment = mockAttachments.find((file) => !this.attachments.includes(file));
    return nextAttachment ? this.update({ attachments: [...this.attachments, nextAttachment] }) : this;
  }

  get project() {
    return mockProjectCatalog.getProject(this.projectId);
  }

  get priorityOption() {
    return mockProjectCatalog.getPriority(this.priority);
  }

  get characterCount(): number {
    return this.request.length;
  }

  get canContinue(): boolean {
    return this.request.trim().length >= 20;
  }

  get summaryTitle(): string {
    return `${this.project.taskTitle} autonome`;
  }

  get summary(): string {
    const normalized = this.request.trim().replace(/\s+/g, " ");
    return normalized.length > 0 ? `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}` : "La demande doit être complétée avant validation.";
  }

  get included(): string[] {
    return this.project.included;
  }

  get excluded(): string[] {
    return this.project.excluded;
  }

  get planItems(): MockPlanItem[] {
    return [
      { id: "access", icon: "shield", title: "Sécuriser l’accès", detail: `Connexion et espace propre à ${this.project.name}`, days: 1 },
      { id: "build", icon: "build", title: `Construire ${this.project.taskTitle.toLowerCase()}`, detail: this.included.join(", "), days: Math.max(1, 2 + this.priorityOption.dayModifier) },
      { id: "verify", icon: "verify", title: "Vérifier le résultat", detail: "Tests, accessibilité et preuve visuelle", days: 1 },
    ];
  }

  get totalDays(): number {
    return this.planItems.reduce((total, item) => total + item.days, 0);
  }

  get planHeading(): string {
    return `Trois étapes, ${this.totalDays} jours estimés`;
  }

  get branchName(): string {
    return `feat/${this.project.repositorySlug}`;
  }

  get proofChecks(): MockProofCopy[] {
    return [
      { label: this.included[0] ?? "Parcours principal", detail: "6 scénarios réussis" },
      { label: this.included[1] ?? "Comportement métier", detail: "Comportement vérifié" },
      { label: "Accessibilité", detail: "Aucun blocage détecté" },
      { label: "Validation technique", detail: "Relecture en cours" },
    ];
  }

  get saveLabel(): string {
    return this.revision > 1 ? `Révision ${this.revision} enregistrée` : "Tâche sauvegardée";
  }
}
