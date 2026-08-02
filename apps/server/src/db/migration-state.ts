/**
 * Garde-fou de dérive des migrations.
 *
 * Le schéma TypeScript et la base peuvent diverger sans bruit : `db:migrate`
 * oublié, branche changée, base restaurée d'un dump plus ancien. Le symptôme
 * est alors une colonne manquante au premier appel produit — un 500 illisible
 * en pleine sortie de `make dev`. On préfère le dire au démarrage.
 */

import { sql } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { log } from "@/observability/log";
import journal from "../../drizzle/meta/_journal.json";

type JournalEntry = { idx: number; when: number; tag: string };

export type MigrationState = {
  status: "ok" | "drift" | "ahead" | "unknown";
  pending: string[];
  reason?: string;
};

/** Drizzle horodate chaque migration appliquée avec le `when` du journal. */
async function queryAppliedTimestamps(): Promise<number[]> {
  const rows = await getDatabase().execute<{ created_at: string | number }>(
    sql`SELECT created_at FROM drizzle.__drizzle_migrations`,
  );
  return Array.from(rows, (row) => Number(row.created_at));
}

/**
 * Les paramètres sont injectables pour que la logique soit testable sans base :
 * la vraie requête n'est qu'une valeur par défaut.
 */
export async function findPendingMigrations(
  appliedTimestamps: () => Promise<number[]> = queryAppliedTimestamps,
  entries: JournalEntry[] = journal.entries,
): Promise<MigrationState> {
  let applied: number[];
  try {
    applied = await appliedTimestamps();
  } catch (error) {
    // Table absente (conteneurs de test qui appliquent le SQL brut), base
    // injoignable, DATABASE_URL manquante : on ne sait pas, on ne ment pas.
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
    const reason = cause instanceof Error ? cause.message : String(cause);
    return { status: "unknown", pending: [], reason: reason.slice(0, 120) };
  }

  // On répond exactement à la question que pose `drizzle-kit migrate` : il
  // applique les entrées du journal dont le `when` dépasse le dernier
  // horodatage enregistré. Comparer par appartenance à l'ensemble des `when`
  // appliqués semble plus strict, mais diverge dès que ces horodatages ont été
  // régénérés dans l'histoire du dépôt : des migrations bel et bien appliquées
  // repassent « en attente » pour toujours. Le garde bloquerait alors le
  // démarrage en réclamant un `make db-migrate` qui, lui, n'a rien à appliquer
  // — une impasse causée par le garde-fou lui-même. Il ne peut jamais
  // contredire le migrateur s'il raisonne comme lui.
  const lastApplied = applied.length > 0 ? Math.max(...applied) : Number.NEGATIVE_INFINITY;
  const pending = entries.filter((entry) => entry.when > lastApplied).map((entry) => entry.tag);
  if (pending.length > 0) return { status: "drift", pending };

  // Base en avance sur le code : toutes les migrations attendues sont là, mais
  // il en reste d'autres. C'est le cas d'un déploiement rollbacké sur un code
  // plus ancien. On le signale sans bloquer, à la différence du retard : une
  // migration récente est le plus souvent additive, et refuser de démarrer
  // empêcherait le rollback au moment précis où il sert d'issue de secours.
  const ahead = applied.length - entries.length;
  return ahead > 0
    ? { status: "ahead", pending: [], reason: `${ahead} migration(s) en base absente(s) du code` }
    : { status: "ok", pending: [] };
}

/**
 * Refuse de servir sur une base en retard, dans tous les environnements.
 *
 * Un simple avertissement disparaîtrait en quelques secondes sous la sortie
 * multiplexée de `make dev` — c'est précisément le bug qu'on corrige. En
 * production, une dérive signifie un déploiement cassé : ne pas servir vaut
 * mieux que servir des 500. L'impossibilité de vérifier est un autre problème,
 * déjà exposé par `/api/readyz` : elle ne doit pas bloquer un redémarrage.
 */
export async function assertSchemaMigrated(): Promise<void> {
  const state = await findPendingMigrations();

  if (state.status === "drift") {
    // Sur une base vierge, les 31 tags feraient un mur de texte — l'inverse de
    // la ligne actionnable qu'on cherche. Les premiers suffisent à identifier.
    const shown = state.pending.slice(0, 3).join(",");
    const rest = state.pending.length - 3;
    log.error("Schéma de base en retard sur les migrations", {
      pending: rest > 0 ? `${shown} (+${rest})` : shown,
      action: "make db-migrate",
    });
    process.exit(1);
  }

  if (state.status === "ahead") {
    log.warn("Base en avance sur le code", {
      reason: state.reason ?? "inconnu",
      action: "vérifier la version déployée",
    });
  }

  if (state.status === "unknown") {
    log.warn("État des migrations invérifiable", { reason: state.reason ?? "inconnu" });
  }
}
