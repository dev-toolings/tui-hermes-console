import Link from "next/link";
import {
  BellIcon,
  BrainCircuitIcon,
  ChevronRightIcon,
  DatabaseIcon,
  MailIcon,
  PaletteIcon,
  ServerIcon,
  ShieldIcon,
} from "lucide-react";
import { Badge, Card, CardSurface, SectionHeading } from "@/components/ui/boardui";
import { SettingsContent } from "@/components/settings/settings-content";
import { getRuntimePublic } from "@/modules/runtime/config";

const SECTIONS = [
  {
    href: "/settings/appearance",
    icon: PaletteIcon,
    title: "Apparence",
    description: "Thème, disposition BoardUI et dimensions du shell.",
    status: "Disponible",
    tone: "success" as const,
  },
  {
    href: "/settings/runtime",
    icon: ServerIcon,
    title: "Runtime Hermes",
    description: "URL, token chiffré, test de connectivité et niveau de gestion.",
    status: "Disponible",
    tone: "success" as const,
  },
  {
    href: "/settings/connectors",
    icon: MailIcon,
    title: "Connecteurs",
    description: "IMAP Gmail, Outlook et pro — secrets chiffrés, test de connexion.",
    status: "Disponible",
    tone: "success" as const,
  },
  {
    href: "/settings/models",
    icon: BrainCircuitIcon,
    title: "Modèles",
    description: "Provider LLM, clé API et modèle par défaut.",
    status: "Disponible",
    tone: "success" as const,
  },
  {
    href: "/settings/notifications",
    icon: BellIcon,
    title: "Notifications",
    description: "Alertes de fin, échec et demande d’autorisation.",
    status: "Préférences locales",
    tone: "info" as const,
  },
  {
    href: "/settings/retention",
    icon: DatabaseIcon,
    title: "Conservation",
    description: "Historique, événements bruts et artefacts persistés.",
    status: "Lecture seule",
    tone: "neutral" as const,
  },
  {
    href: "/settings/security",
    icon: ShieldIcon,
    title: "Sécurité",
    description: "Compte administrateur, secrets runtime et périmètre d’exécution.",
    status: "Partiel",
    tone: "warning" as const,
  },
];

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const runtime = await getRuntimePublic();
  const runtimeLabel = !runtime.configured
    ? "Non configuré"
    : runtime.lastHealthStatus === "healthy"
      ? `Connecté${runtime.detectedVersion ? ` · ${runtime.detectedVersion}` : ""}`
      : runtime.lastHealthStatus === "unauthorized"
        ? "Token invalide"
        : runtime.lastHealthStatus === "unreachable"
          ? "Injoignable"
          : "Configuré";

  const runtimeTone = !runtime.configured
    ? ("warning" as const)
    : runtime.lastHealthStatus === "healthy"
      ? ("success" as const)
      : ("danger" as const);

  return (
    <SettingsContent>
      <SectionHeading
        title="Préférences de la Console"
        description="La configuration produit reste distincte de la configuration interne de Hermes."
      />

      <Card>
        <CardSurface className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[0.8125rem] font-medium">Runtime Hermes</p>
            <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
              Connexion active utilisée pour les missions et le diagnostic.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={runtimeTone}>{runtimeLabel}</Badge>
            <Link
              href="/settings/runtime"
              className="text-[0.75rem] font-medium text-primary hover:underline"
            >
              Configurer
            </Link>
          </div>
        </CardSurface>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <Link key={section.href} href={section.href} className="group block">
              <Card className="h-full transition-colors group-hover:border-ring/60">
                <CardSurface className="flex h-full items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-ai-tertiary text-muted-foreground">
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[0.8125rem] font-medium">{section.title}</span>
                      <Badge tone={section.tone}>{section.status}</Badge>
                    </span>
                    <span className="mt-1 block text-[0.6875rem] text-muted-foreground">
                      {section.description}
                    </span>
                  </span>
                  <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </CardSurface>
              </Card>
            </Link>
          );
        })}
      </div>
    </SettingsContent>
  );
}
