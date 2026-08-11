"use client";

import { CircleCheckIcon } from "lucide-react";
import { Badge, Card, CardSurface, PageShell, SectionHeading } from "@/components/ui/boardui";

type GateStatus = "delivered" | "in-progress" | "target";

const STATUS_LABELS: Record<GateStatus, { label: string; tone: "success" | "info" | "neutral" }> = {
  delivered: { label: "Livré", tone: "success" },
  "in-progress": { label: "En cours", tone: "info" },
  target: { label: "Cible", tone: "neutral" },
};

const FOUNDATION = [
  "Demande guidée par intention, résultat attendu, exclusions et plan validé",
  "Contrat de progression métier prêt pour les futures exécutions isolées",
  "Missions, sessions et artefacts (SHA-256, quotas, chemins durcis)",
  "Runtime direct ou tunnel SSH, credentials chiffrés, connecteurs IMAP typés",
  "Approbations, annulation, retry, réconciliation et détection d'inactivité",
  "Journal d'audit append-only, export expurgé et rétention",
  "Auth Google OIDC allowlistée, sessions opaques et protection CSRF",
];

type Gate = {
  id: number;
  title: string;
  status: GateStatus;
  summary: string;
  items: string[];
};

const GATES: Gate[] = [
  {
    id: 0,
    title: "Validation du parcours guidé",
    status: "in-progress",
    summary:
      "Prouver qu’un demandeur métier peut cadrer puis vérifier une modification sans comprendre Git, le shell ou Hermes.",
    items: [
      "Recruter trois agences ou intégrateurs partenaires",
      "Demande, exclusions et plan compris puis validés avant exécution",
      "Résultat vérifiable sans imposer une pull request au demandeur",
      "Un workflow réel déployé chez un client par partenaire",
      "Mesurer installation, taux terminal, reprises manuelles, coût et valeur livrée",
      "Engagement payant avant toute fleet",
    ],
  },
  {
    id: 1,
    title: "Livraison logicielle sûre",
    status: "in-progress",
    summary:
      "Rendre le produit exploitable et défendable en production. La Gate reste ouverte sur les preuves E2E.",
    items: [
      "Révision de spécification et commit de base figés par tentative",
      "Sandbox, branche et périmètre de dépôt attribués",
      "Diff, tests, fichiers modifiés et preuve métier consultables",
      "Persistance et durabilité des artefacts en production",
      "Confinement du runtime Hermes (pinning, isolation OS)",
      "Policy fail-closed hors process agent avec approbations signées et attribuées",
      "Journal d'audit append-only séparé des événements runtime",
      "Rétention, suppression, export, backup et restauration testés",
      "E2E du parcours critique et tests réels du tunnel SSH",
    ],
  },
  {
    id: 2,
    title: "Validations métier et technique",
    status: "in-progress",
    summary:
      "Attribuer séparément la validation du résultat et celle des décisions techniques sensibles.",
    items: [
      "Site ou projet comme frontière minimale",
      "Rôles admin, operator, requester, approver et auditor",
      "Ownership sur agents, missions, artefacts et connecteurs",
      "Validation fonctionnelle par le demandeur métier",
      "Validation technique pour dépendance, migration, auth, paiement, infrastructure ou suppression",
      "Mise en attente compréhensible lorsqu’un approbateur technique manque",
      "OIDC générique, puis SAML/SCIM sur demande qualifiée",
      "Politiques par outil, chemin, connecteur, modèle et budget",
    ],
  },
  {
    id: 3,
    title: "Distribution Edge / Relay",
    status: "target",
    summary:
      "Étendre l'agent à plusieurs sites et à plusieurs runtimes, sans ouvrir le socket Docker.",
    items: [
      "Enrôlement court et révocable, identité mTLS",
      "Connexion sortante pour les sites derrière NAT",
      "Plusieurs runtimes par organisation",
      "Niveaux external, connected et managed explicites",
      "Restart, upgrade, rollback et backup sur runtimes managed",
    ],
  },
  {
    id: 4,
    title: "Qualité et coûts",
    status: "target",
    summary:
      "Rendre les résultats mesurables et comparables, et piloter les coûts par seuils explicites.",
    items: [
      "Export OpenTelemetry / OpenInference",
      "Intégration Langfuse, Phoenix, LangSmith ou backend client",
      "Version d'agent, instructions, skills, runtime et policy sur chaque mission",
      "Jeux de cas de référence et replay",
      "Seuils coût, latence, erreur, intervention humaine et réussite métier",
      "Promotion de versions avec rollback",
    ],
  },
];

function GateCard({ gate }: { gate: Gate }) {
  const status = STATUS_LABELS[gate.status];
  return (
    <CardSurface>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground"
            aria-hidden="true"
          >
            G{gate.id}
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">{gate.title}</h3>
            <p className="mt-1 max-w-[70ch] text-[0.8125rem] leading-relaxed text-muted-foreground">
              {gate.summary}
            </p>
          </div>
        </div>
        <Badge tone={status.tone} className="shrink-0">
          {status.label}
        </Badge>
      </div>
      <ul className="mt-4 space-y-2">
        {gate.items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
            <CircleCheckIcon
              className="mt-0.5 size-4 shrink-0 text-muted-foreground/60"
              aria-hidden="true"
            />
            <span className="min-w-0">{item}</span>
          </li>
        ))}
      </ul>
    </CardSurface>
  );
}

export function RoadmapScreen() {
  return (
    <PageShell>
      <SectionHeading
        title="Roadmap"
        description="Le chemin produit de Hermes Console, tel qu'il est tenu dans le PRD. Livré, en cours et cible sont distingués explicitement : ce qui est « Cible » n'est pas annoncé comme livré."
      />

      <Card>
        <CardSurface>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-pos-100 text-sm font-semibold text-pos-700"
                aria-hidden="true"
              >
                ✓
              </span>
              <h3 className="text-sm font-semibold text-foreground">Socle livré</h3>
            </div>
            <Badge tone="success">Livré</Badge>
          </div>
          <ul className="mt-4 space-y-2">
            {FOUNDATION.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-pos-700" aria-hidden="true" />
                <span className="min-w-0">{item}</span>
              </li>
            ))}
          </ul>
        </CardSurface>
      </Card>

      <div className="flex flex-col gap-4">
        {GATES.map((gate) => (
          <GateCard key={gate.id} gate={gate} />
        ))}
      </div>

      <p className="max-w-[70ch] text-xs text-muted-foreground">
        Le PRD reste la source de vérité. Les gates 1 et 2 listent des livrables partiellement
        implémentés : leur statut « En cours » signifie que l'acceptation de bout en bout n'est pas
        encore acquise.
      </p>
    </PageShell>
  );
}
