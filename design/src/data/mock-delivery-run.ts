export type MockCheckState = "done" | "running";

export type MockDeliveryCheck = {
  id: string;
  label: string;
  detail: string;
  state: MockCheckState;
};

type MockDeliveryRunState = {
  checks: MockDeliveryCheck[];
  viewedCheckIds: string[];
  previewOpened: boolean;
};

const initialChecks: MockDeliveryCheck[] = [
  { id: "journey", label: "Parcours client", detail: "6 scénarios réussis", state: "done" },
  { id: "documents", label: "Factures PDF", detail: "Téléchargement vérifié", state: "done" },
  { id: "accessibility", label: "Accessibilité", detail: "Aucun blocage détecté", state: "done" },
  { id: "review", label: "Validation technique", detail: "Relecture en cours", state: "running" },
];

export class MockDeliveryRun {
  readonly checks: MockDeliveryCheck[];
  readonly viewedCheckIds: string[];
  readonly previewOpened: boolean;

  private constructor(state: MockDeliveryRunState) {
    this.checks = state.checks;
    this.viewedCheckIds = state.viewedCheckIds;
    this.previewOpened = state.previewOpened;
  }

  static create(): MockDeliveryRun {
    return new MockDeliveryRun({ checks: initialChecks, viewedCheckIds: [], previewOpened: false });
  }

  viewCheck(id: string): MockDeliveryRun {
    return new MockDeliveryRun({ checks: this.checks, viewedCheckIds: [...new Set([...this.viewedCheckIds, id])], previewOpened: this.previewOpened });
  }

  completeReview(): MockDeliveryRun {
    return new MockDeliveryRun({
      checks: this.checks.map((check) => check.id === "review" ? { ...check, state: "done", detail: "Relecture approuvée" } : check),
      viewedCheckIds: this.viewedCheckIds,
      previewOpened: this.previewOpened,
    });
  }

  openPreview(): MockDeliveryRun {
    return new MockDeliveryRun({ checks: this.checks, viewedCheckIds: this.viewedCheckIds, previewOpened: true });
  }

  reset(): MockDeliveryRun {
    return MockDeliveryRun.create();
  }

  isViewed(id: string): boolean {
    return this.viewedCheckIds.includes(id);
  }

  get completedChecks(): number {
    return this.checks.filter((check) => check.state === "done").length;
  }

  get progress(): number {
    return Math.round((this.completedChecks / this.checks.length) * 100);
  }

  get isComplete(): boolean {
    return this.completedChecks === this.checks.length;
  }
}
