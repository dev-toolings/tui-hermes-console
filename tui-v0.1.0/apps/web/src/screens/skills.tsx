import { useCallback, useMemo, useState } from "react";
import { LoaderCircleIcon, SearchIcon, SparklesIcon } from "lucide-react";
import { DataTable, Skeleton, Switch, type ColumnDef } from "@boardui/ui";
import { Badge, Card, CardSurface, PageShell, SectionHeading } from "@/components/ui/boardui";
import { toast } from "@/components/ui/toast";
import { toggleSkill } from "@/lib/api";
import { Link } from "@/lib/router";
import type { HermesSkillDto } from "@console/core/types/api";
import type { SkillsData } from "@/loaders";

export function SkillsSkeleton() {
  return (
    <PageShell>
      <SectionHeading
        title="Skills"
        description="Les skills actuellement exposés par Hermes pour le runtime du contexte actif."
        action={<Skeleton className="h-6 w-36 rounded-full" />}
      />

      <Card>
        <div role="status" aria-label="Chargement des skills">
          <CardSurface className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-seam px-4 py-3.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-9 w-full max-w-xs rounded-lg" />
            </div>
            <div className="overflow-x-auto border-t border-border">
              <table className="w-full min-w-[760px] table-fixed text-sm">
                <thead>
                  <tr className="h-10 border-b border-border">
                    <th className="w-[28%] px-2 text-left"><Skeleton className="h-3 w-12" /></th>
                    <th className="w-[42%] px-2 text-left"><Skeleton className="h-3 w-20" /></th>
                    <th className="w-[18%] px-2 text-left"><Skeleton className="h-3 w-16" /></th>
                    <th className="w-[12%] px-2 text-right"><Skeleton className="ml-auto h-3 w-12" /></th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 12 }, (_, index) => (
                    <tr key={index} className="h-16 border-b border-border">
                      <td className="px-2"><Skeleton className="h-8 w-44 rounded-lg" /></td>
                      <td className="px-2"><Skeleton className="h-8 w-full max-w-md" /></td>
                      <td className="px-2"><Skeleton className="h-6 w-24 rounded-full" /></td>
                      <td className="px-2"><Skeleton className="ml-auto h-5 w-9 rounded-full" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border p-3">
              <Skeleton className="h-9 w-28 rounded-lg" />
              <div className="hidden items-center gap-1 sm:flex">
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} className="size-8 rounded-lg" />
                ))}
              </div>
              <Skeleton className="h-9 w-20 rounded-lg" />
            </div>
          </CardSurface>
        </div>
      </Card>
    </PageShell>
  );
}

export function SkillsScreen({ data }: { data: SkillsData }) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase("fr");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [skillOverrides, setSkillOverrides] = useState<Record<string, boolean>>({});
  const [pendingSkill, setPendingSkill] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const skillsWithState = useMemo(
    () =>
      data.skills.map((skill) => ({
        ...skill,
        enabled: skillOverrides[skill.name] ?? skill.enabled,
      })),
    [data.skills, skillOverrides],
  );

  const filteredSkills = useMemo(
    () =>
      normalizedQuery
        ? skillsWithState.filter((skill) =>
            `${skill.name} ${skill.description} ${skill.category ?? ""}`
              .toLocaleLowerCase("fr")
              .includes(normalizedQuery),
          )
        : skillsWithState,
    [normalizedQuery, skillsWithState],
  );

  const handleToggle = useCallback(
    async (skill: HermesSkillDto) => {
      if (!data.skillsMutable || pendingSkill) return;

      setPendingSkill(skill.name);
      setToggleError(null);
      try {
        const updated = await toggleSkill(skill.name, !skill.enabled);
        setSkillOverrides((current) => ({ ...current, [updated.name]: updated.enabled }));
        toast.success(`${updated.name} ${updated.enabled ? "activé" : "désactivé"}.`);
      } catch (error) {
        const message = error instanceof Error
          ? error.message
          : "Impossible de modifier l’état du skill.";
        setToggleError(message);
        toast.error(message);
      } finally {
        setPendingSkill(null);
      }
    },
    [data.skillsMutable, pendingSkill],
  );

  const columns = useMemo<ColumnDef<HermesSkillDto, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Skill",
        cell: ({ row }) => (
          <div className="flex min-w-52 items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-info-soft text-info-700">
              <SparklesIcon className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[0.8125rem] font-semibold text-foreground">
                {row.original.name}
              </p>
              <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
                Hermes runtime
              </p>
            </div>
          </div>
        ),
      },
      {
        accessorKey: "description",
        header: "Description",
        cell: ({ row }) => (
          <p
            className="min-w-64 max-w-[70ch] min-h-10 line-clamp-2 whitespace-normal text-[0.75rem] leading-5 text-muted-foreground"
            title={row.original.description || "Aucune description fournie par Hermes."}
          >
            {row.original.description || "Aucune description fournie par Hermes."}
          </p>
        ),
      },
      {
        accessorKey: "category",
        header: "Catégorie",
        cell: ({ row }) => <Badge>{row.original.category ?? "Général"}</Badge>,
      },
      {
        id: "enabled",
        header: "Activé",
        cell: ({ row }) => {
          const skill = row.original;
          const unavailableTitle =
            "Le Dashboard Hermes est requis pour modifier ce skill.";
          const actionLabel = skill.enabled
            ? `Désactiver ${skill.name}`
            : `Activer ${skill.name}`;

          return (
            <div className="flex min-w-20 items-center justify-end gap-2 pr-4">
              {pendingSkill === skill.name ? (
                <LoaderCircleIcon className="size-3.5 animate-spin text-muted-foreground" aria-hidden="true" />
              ) : null}
              <Switch
                checked={skill.enabled}
                disabled={!data.skillsMutable || pendingSkill !== null}
                onCheckedChange={() => void handleToggle(skill)}
                aria-label={actionLabel}
                title={data.skillsMutable ? actionLabel : unavailableTitle}
              />
            </div>
          );
        },
      },
    ],
    [data.skillsMutable, handleToggle, pendingSkill],
  );

  const scopeLabel = data.projectId
    ? `Projet ${data.projectId}`
    : "Tous les projets du site";

  return (
    <PageShell>
      <SectionHeading
        title="Skills"
        description="Les skills actuellement exposés par Hermes pour le runtime du contexte actif."
        action={<Badge tone="info">{scopeLabel}</Badge>}
      />

      <Card>
        <CardSurface className="p-0">
          <DataTable
            columns={columns}
            data={filteredSkills}
            getRowId={(skill) => `${skill.category ?? "general"}:${skill.name}`}
            page={page}
            pageSize={pageSize}
            pageSizeOptions={[12, 24, 48, 96]}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            rowsPerPageLabel="Lignes par page"
            previousLabel="Précédent"
            nextLabel="Suivant"
            minWidth="680px"
            toolbar={
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-seam px-4 py-3.5">
                <div className="flex items-center gap-2">
                  <SparklesIcon className="size-4 text-primary" aria-hidden="true" />
                  <span className="text-[0.8125rem] font-medium">
                    {filteredSkills.length} sur {data.skills.length} skill
                    {data.skills.length === 1 ? "" : "s"}
                  </span>
                </div>
                <label className="flex h-9 min-w-52 flex-1 items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 sm:max-w-xs">
                  <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="sr-only">Filtrer les skills</span>
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setPage(1);
                    }}
                    placeholder="Filtrer…"
                    className="min-w-0 flex-1 bg-transparent text-[0.75rem] outline-none placeholder:text-muted-foreground"
                  />
                </label>
                {toggleError || !data.skillsMutable ? (
                  <p
                    className="basis-full text-[0.6875rem] text-muted-foreground"
                    role={toggleError ? "alert" : "note"}
                  >
                    {toggleError ??
                      <>Lecture seule : démarrez le Dashboard Hermes dans <Link href="/settings/runtime" className="font-medium text-foreground underline underline-offset-2">Paramètres → Runtime</Link> pour modifier les skills.</>}
                  </p>
                ) : null}
              </div>
            }
            empty={
              <>
                <p className="font-medium text-foreground">
                  {data.skills.length === 0 ? "Aucun skill exposé" : "Aucun résultat"}
                </p>
                <p className="mt-1 text-[0.75rem]">
                  {data.skills.length === 0
                    ? "Hermes ne renvoie aucun skill pour ce runtime."
                    : "Modifiez le filtre pour retrouver un skill."}
                </p>
              </>
            }
          />
        </CardSurface>
      </Card>
    </PageShell>
  );
}
