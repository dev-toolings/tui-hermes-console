import { PlusIcon } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@boardui/ui";
import { ButtonLink, Card, CardSurface, PageShell, SectionHeading } from "@/components/ui/boardui";
import { MissionsKanban } from "@/components/missions/missions-kanban";
import { MissionsTable } from "@/components/missions/missions-table";
import { toMissionRows } from "@/components/missions/mission-row";
import { useRouter } from "@/lib/router";
import { readPersonaCapabilities } from "@/lib/persona-capabilities";
import type { MissionsData } from "@/loaders";

export type MissionsView = "kanban" | "table";

/**
 * `/runs`, en deux lectures du même jeu de fils.
 *
 * Le kanban répond à « où en est le parc » et rend les deux gestes possibles —
 * annuler, relancer. Le tableau répond à « combien, depuis quand », que des
 * colonnes ne montrent pas. La vue vit dans l'URL plutôt qu'en état local :
 * un lien vers `/runs` reste partageable dans la lecture qu'on avait choisie.
 */
export function MissionsScreen({
  data,
  filter,
  view,
}: {
  data: MissionsData;
  /** `?filter=` de l'URL — TanStack le valide dans la route et le passe ici. */
  filter?: string;
  view: MissionsView;
}) {
  const router = useRouter();
  const capabilities = readPersonaCapabilities();
  const canCreate = capabilities.has("thread.create");
  const canCancel = capabilities.has("run.cancel");
  const canRetry = capabilities.has("run.retry");
  const rows = toMissionRows(data.threads);

  return (
    <PageShell>
      <SectionHeading
        title="Historique des missions"
        description="L’historique relisible est conservé par la Console, pas par la durée de vie du runtime."
        action={
          <div className="flex items-center gap-2">
            <ToggleGroup
              type="single"
              value={view}
              // Radix émet "" quand on reclique l'élément actif : on ignore,
              // il n'existe pas de troisième vue.
              onValueChange={(next) => next && router.replace(`/runs?view=${next}`)}
              variant="outline"
              size="sm"
              aria-label="Vue de l’historique"
            >
              <ToggleGroupItem value="kanban">Kanban</ToggleGroupItem>
              <ToggleGroupItem value="table">Tableau</ToggleGroupItem>
            </ToggleGroup>
            {canCreate ? (
              <ButtonLink href="/runs/new" variant="primary">
                <PlusIcon className="size-4" />
                Nouvelle mission
              </ButtonLink>
            ) : null}
          </div>
        }
      />

      {view === "kanban" ? (
        <MissionsKanban rows={rows} canCreate={canCreate} canCancel={canCancel} canRetry={canRetry} />
      ) : (
        <Card>
          <CardSurface className="overflow-hidden p-0">
            <MissionsTable rows={rows} filter={filter} />
          </CardSurface>
        </Card>
      )}
    </PageShell>
  );
}
