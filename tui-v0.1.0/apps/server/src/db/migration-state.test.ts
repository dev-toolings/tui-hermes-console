import { describe, expect, test } from "bun:test";
import { findPendingMigrations } from "./migration-state";

const entries = [
  { idx: 0, when: 1785343843912, tag: "0000_nice_harry_osborn" },
  { idx: 1, when: 1785348000000, tag: "0001_agents_runtime" },
  { idx: 30, when: 1785744000000, tag: "0030_runtime_ssh_workspace" },
];

describe("findPendingMigrations", () => {
  test("a base à jour ne signale rien", async () => {
    const state = await findPendingMigrations(
      async () => entries.map((entry) => entry.when),
      entries,
    );

    expect(state).toEqual({ status: "ok", pending: [] });
  });

  test("une migration absente de la base est une dérive nommée", async () => {
    const state = await findPendingMigrations(
      async () => [1785343843912, 1785348000000],
      entries,
    );

    expect(state.status).toBe("drift");
    expect(state.pending).toEqual(["0030_runtime_ssh_workspace"]);
  });

  // Régression : la comparaison a d'abord testé l'appartenance à l'ensemble des
  // `when` appliqués. Une base dont les horodatages ont été enregistrés avant
  // une régénération du journal repassait alors intégralement « en attente »,
  // alors que `drizzle-kit migrate` — qui applique tout ce qui dépasse le
  // dernier horodatage — n'avait rien à y faire. Le garde-fou bloquait le
  // démarrage en réclamant une commande sans effet : une impasse.
  test("des horodatages plus récents que le journal ne sont pas une dérive", async () => {
    const state = await findPendingMigrations(
      async () => entries.map((entry) => entry.when + 5_000),
      entries,
    );

    expect(state.status).toBe("ok");
    expect(state.pending).toEqual([]);
  });

  test("une base vide signale toutes les migrations", async () => {
    const state = await findPendingMigrations(async () => [], entries);

    expect(state.status).toBe("drift");
    expect(state.pending).toHaveLength(entries.length);
  });

  // Le cas des conteneurs éphémères des tests d'intégration : ils appliquent le
  // SQL brut par psql, donc `drizzle.__drizzle_migrations` n'existe pas.
  test("une requête en échec renvoie unknown sans jamais lever", async () => {
    const state = await findPendingMigrations(async () => {
      throw new Error('relation "drizzle.__drizzle_migrations" does not exist');
    }, entries);

    expect(state.status).toBe("unknown");
    expect(state.pending).toEqual([]);
    expect(state.reason).toContain("__drizzle_migrations");
  });

  test("unknown remonte la cause quand l'erreur est enveloppée par Drizzle", async () => {
    const state = await findPendingMigrations(async () => {
      throw Object.assign(new Error("Failed query"), {
        cause: new Error("DATABASE_URL_MISSING"),
      });
    }, entries);

    expect(state.status).toBe("unknown");
    expect(state.reason).toBe("DATABASE_URL_MISSING");
  });

  test("la raison reste courte même si le driver est bavard", async () => {
    const state = await findPendingMigrations(async () => {
      throw new Error("x".repeat(500));
    }, entries);

    expect(state.reason).toHaveLength(120);
  });
});
