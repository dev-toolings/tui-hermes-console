import { ArchiveIcon, FileBoxIcon, MessageSquareIcon, RouteIcon } from "lucide-react";
import { Badge, Card, CardSurface, SectionHeading } from "@/components/ui/boardui";
import { SettingsContent } from "@/components/settings/settings-content";
import { formatBytes } from "@console/core/lib/format-bytes";
import type { RetentionData } from "@/loaders";

export function SettingsRetentionScreen({ data }: { data: RetentionData }) {
  const { stats, limits } = data;

  const rows = [
    { label: "Agents", value: stats.agents, icon: ArchiveIcon },
    { label: "Conversations (threads)", value: stats.threads, icon: MessageSquareIcon },
    { label: "Messages", value: stats.messages, icon: MessageSquareIcon },
    { label: "Événements bruts", value: stats.events, icon: RouteIcon },
  ];

  return (
    <SettingsContent>
      <SectionHeading
        title="Conservation"
        description="La Console est la source de vérité de l’historique — le runtime ne rejoue pas ses événements."
      />

      <Card>
        <CardSurface>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-[0.8125rem] font-medium">Données persistées</h3>
              <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
                Comptage PostgreSQL sur cette instance. Aucune purge automatique en v0.1.
              </p>
            </div>
            <Badge tone="neutral">Illimité</Badge>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {rows.map((row) => {
              const Icon = row.icon;
              return (
                <div
                  key={row.label}
                  className="flex items-center justify-between rounded-xl border border-input bg-card px-3 py-2.5"
                >
                  <span className="flex items-center gap-2 text-[0.8125rem]">
                    <Icon className="size-4 text-muted-foreground" />
                    {row.label}
                  </span>
                  <span className="font-mono text-[0.8125rem] font-medium">{row.value}</span>
                </div>
              );
            })}
          </div>
        </CardSurface>
      </Card>

      <Card>
        <CardSurface className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-ai-tertiary text-muted-foreground">
              <FileBoxIcon className="size-4" />
            </span>
            <div>
              <h3 className="text-[0.8125rem] font-medium">Fichiers et artefacts (Phase 4)</h3>
              <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
                Quotas configurés côté serveur. Le scan des sorties agent arrive avec le volume
                partagé Hermes.
              </p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Quota label="Taille max / fichier" value={formatBytes(limits.maxFile)} />
            <Quota label="Quota mission" value={formatBytes(limits.maxTotal)} />
            <Quota label="Fichiers / mission" value={String(limits.maxCount)} />
          </div>
        </CardSurface>
      </Card>

      <div className="rounded-xl bg-info-soft p-3 text-[0.75rem] text-info-700">
        Les missions terminées, leurs messages et événements normalisés restent consultables après
        redémarrage. La politique de rétention automatique (purge planifiée) est au backlog post-v0.1.
      </div>
    </SettingsContent>
  );
}

function Quota({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-input bg-card p-3">
      <p className="text-[0.6875rem] text-muted-foreground">{label}</p>
      <p className="mt-1 text-[0.8125rem] font-semibold">{value}</p>
    </div>
  );
}
