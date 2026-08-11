"use client";

import { InboxIcon, PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Button, ButtonLink, Card, CardSurface, PageShell, SectionHeading } from "@/components/ui/boardui";
import { Link } from "@/lib/router";
import { cn } from "@/lib/cn";
import {
  buildInboxItems,
  groupInboxSections,
  INBOX_CATEGORY_LABELS,
  isOverdueWait,
  waitingSince,
  type InboxCategory,
} from "@/lib/inbox";
import { readPersonaCapabilities, readPersonaRole } from "@/lib/persona-capabilities";
import { fetchGuidedTasks, fetchInboxMissions } from "@/lib/api";
import type { InboxData } from "@/loaders";

const CATEGORY_TONES: Record<InboxCategory, "warning" | "danger" | "info" | "neutral"> = {
  needs_action: "warning",
  failure: "danger",
  agent_activity: "info",
  draft: "neutral",
};

export function inboxHeading(waiting: number): string {
  return waiting === 0 ? "File à jour" : `${waiting} actions à traiter`;
}

/**
 * File opérationnelle : les tâches et missions qui demandent encore
 * quelque chose, réparties en sections par nature plutôt qu'en liste
 * triée par catégorie. La section 1 (décision) n'est peuplée que si la
 * capacité permet de décider, la section 2 (reprise) qu'une relance est
 * possible : sinon les items restent dans les activités. L'Inbox n'est qu'une projection de
 * l'état métier, elle ne stocke rien elle-même.
 */
export function InboxScreen({ data }: { data: InboxData }) {
  const inboxDataKey = `${data.page.nextCursor ?? "end"}:${data.missionPage.nextCursor ?? "end"}:${data.tasks.map((task) => task.id).join(",")}:${data.missions.map((mission) => mission.id).join(",")}`;
  return <InboxScreenContents key={inboxDataKey} data={data} />;
}

function InboxScreenContents({ data }: { data: InboxData }) {
  const capabilities = readPersonaCapabilities();
  const canCreate = capabilities.has("guided.task.create");
  const [tasks, setTasks] = useState(data.tasks);
  const [page, setPage] = useState(data.page);
  const [missions, setMissions] = useState(data.missions);
  const [missionPage, setMissionPage] = useState(data.missionPage);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);

  const items = buildInboxItems({ tasks, missions });
  const sections = groupInboxSections(items, { capabilities, role: readPersonaRole() });
  // Le compteur d'en-tête ne compte que les actions à traiter, pas les activités.
  const waiting = sections
    .filter((section) => section.id !== "in_progress")
    .reduce((total, section) => total + section.items.length, 0);
  // L'instant de référence est un état, pas un `Date.now()` dans le rendu, que
  // la règle de pureté du compilateur React refuse. Il avance chaque minute :
  // une Console laissée ouverte doit voir l'attente vieillir et une ligne
  // basculer en alerte au passage des 24 h, sans rechargement.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  async function loadMore() {
    if (loadingMore || (!page.nextCursor && !missionPage.nextCursor)) return;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const [nextTasks, nextMissions] = await Promise.allSettled([
        page.nextCursor ? fetchGuidedTasks({ cursor: page.nextCursor }) : Promise.resolve(null),
        missionPage.nextCursor ? fetchInboxMissions({ cursor: missionPage.nextCursor }) : Promise.resolve(null),
      ]);
      if (nextTasks.status === "fulfilled" && nextTasks.value) {
        setTasks((previous) => [...previous, ...nextTasks.value!.tasks]);
        setPage(nextTasks.value.page);
      }
      if (nextMissions.status === "fulfilled" && nextMissions.value) {
        setMissions((previous) => [...previous, ...nextMissions.value!.missions]);
        setMissionPage(nextMissions.value.page);
      }
      if (nextTasks.status === "rejected" || nextMissions.status === "rejected") setMoreError(true);
    } catch {
      setMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <PageShell>
      <SectionHeading
        title={inboxHeading(waiting)}
        description="Les tâches qui demandent une décision, celles qui avancent et celles qui ont échoué. Les éléments terminés ne figurent pas dans cette file."
        action={
          canCreate ? (
            <ButtonLink href="/tasks/new" variant="primary">
              <PlusIcon className="size-4" />
              Nouvelle tâche
            </ButtonLink>
          ) : null
        }
      />

      {data.degraded ? (
        <Card>
          <CardSurface>
            <p role="status" className="text-sm text-warn-700">
              Une source n’a pas répondu. Cette file est incomplète.
            </p>
          </CardSurface>
        </Card>
      ) : null}

      {sections.length === 0 ? (
        <Card>
          <CardSurface>
            <p className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <InboxIcon className="size-5" aria-hidden />
              {page.hasMore || missionPage.hasMore
                ? "Cette page ne contient aucun élément visible. Chargez la suite pour poursuivre la file."
                : "Toutes les actions actives sont décidées ou reprises. Les éléments terminés ne figurent pas dans cette file."}
            </p>
          </CardSurface>
        </Card>
      ) : (
        <>
          {sections.map((section) => (
          <Card key={section.id}>
            <CardSurface className="p-0">
              <div className="border-b border-seam px-4 py-3.5">
                <SectionHeading title={section.title} />
              </div>
              <div className="divide-y divide-border">
                {section.items.map((item) => {
                  const overdue = section.id === "needs_action" && isOverdueWait(item.latestActivityAt, now);
                  const age = waitingSince(item.latestActivityAt, now);
                  return (
                    <div key={item.conversationId} className={cn("flex items-stretch", overdue && "bg-warn-soft")}>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex min-w-0 flex-1 gap-3 px-4 py-3",
                          // Le survol ne doit pas effacer l'alerte de la ligne.
                          overdue ? "hover:bg-warn-100" : "hover:bg-muted/50",
                        )}
                      >
                        <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-3">
                            <span className="truncate text-[0.875rem] font-medium">{item.title}</span>
                            <span
                              className={cn(
                                "shrink-0 text-[0.6875rem]",
                                overdue ? "font-semibold text-warn-700" : "text-muted-foreground",
                              )}
                            >
                              {overdue ? `bloqué ${age}` : age}
                            </span>
                          </span>
                          <span className="mt-0.5 block truncate text-[0.6875rem] text-muted-foreground">
                            {item.context}
                          </span>
                          <span className="mt-1.5 block text-[0.8125rem] text-muted-foreground">{item.preview}</span>
                          <span className="mt-2 flex flex-wrap gap-1.5">
                            {item.categories.map((category) => (
                              <Badge key={category} tone={CATEGORY_TONES[category]}>
                                {INBOX_CATEGORY_LABELS[category]}
                              </Badge>
                            ))}
                          </span>
                        </span>
                      </Link>
                    </div>
                  );
                })}
              </div>
            </CardSurface>
          </Card>
          ))}
        </>
      )}
      {page.hasMore || missionPage.hasMore ? (
        <div className="flex justify-center">
          <Button type="button" onClick={loadMore} disabled={loadingMore || (!page.nextCursor && !missionPage.nextCursor)}>
            {loadingMore ? "Chargement…" : "Charger la suite"}
          </Button>
        </div>
      ) : null}
      {moreError ? <p role="status" className="text-center text-sm text-warn-700">La suite n’a pas pu être chargée.</p> : null}
    </PageShell>
  );
}
