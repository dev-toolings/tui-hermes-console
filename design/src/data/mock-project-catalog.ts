export type MockPriority = "low" | "normal" | "high";

export type MockProject = {
  id: string;
  name: string;
  taskTitle: string;
  repositorySlug: string;
  included: string[];
  excluded: string[];
};

export type MockPriorityOption = {
  id: MockPriority;
  label: string;
  dayModifier: number;
};

export class MockProjectCatalog {
  readonly projects: MockProject[];
  readonly priorities: MockPriorityOption[];

  constructor() {
    this.projects = [
      {
        id: "acme-portal",
        name: "Portail Acme",
        taskTitle: "Espace client",
        repositorySlug: "portail-acme",
        included: ["Historique des commandes", "Téléchargement des factures", "Formulaire de contact support"],
        excluded: ["Paiement en ligne", "Application mobile native"],
      },
      {
        id: "nova-backoffice",
        name: "Backoffice Nova",
        taskTitle: "Suivi des demandes",
        repositorySlug: "backoffice-nova",
        included: ["Liste des demandes", "Filtres de statut", "Export CSV"],
        excluded: ["Facturation", "Application mobile native"],
      },
      {
        id: "atelier-site",
        name: "Site Atelier",
        taskTitle: "Prise de rendez-vous",
        repositorySlug: "site-atelier",
        included: ["Créneaux disponibles", "Confirmation par email", "Annulation client"],
        excluded: ["Paiement en ligne", "Synchronisation comptable"],
      },
    ];

    this.priorities = [
      { id: "low", label: "Flexible", dayModifier: 1 },
      { id: "normal", label: "Normale", dayModifier: 0 },
      { id: "high", label: "Prioritaire", dayModifier: -1 },
    ];
  }

  getProject(id: string): MockProject {
    return this.projects.find((project) => project.id === id) ?? this.projects[0];
  }

  getPriority(id: MockPriority): MockPriorityOption {
    return this.priorities.find((priority) => priority.id === id) ?? this.priorities[1];
  }
}

export const mockProjectCatalog = new MockProjectCatalog();
