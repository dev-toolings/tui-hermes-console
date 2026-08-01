# Preuve locale — US-G1-006E — purge conditionnée

- **Date :** 01-08-2026
- **Environnement :** Bun + PostgreSQL 17.6 Docker épinglé + filesystem scratch
- **Verdict :** `IMPLÉMENTÉE LOCALE` — US-G1-006 complète reste ouverte

## Scénarios exécutés

- Purge d’un preview site A : rows métier supprimées par cascade, dossiers artefacts/workdir
  déplacés puis nettoyés, `purged_at` marqué, deux audits `allowed` (intention/outcome).
- Deuxième tentative : `LIFECYCLE_PURGE_ALREADY_CONSUMED`, aucune seconde mutation et refus audité.
- Legal hold activé après la création : `LIFECYCLE_PURGE_LEGAL_HOLD`, aucune mutation.
- Preview d’un autre site : refus borné au site appelant, données et fichiers inchangés.
- Ledger indisponible : `LIFECYCLE_PURGE_AUDIT_UNAVAILABLE`, zéro effet DB/filesystem.
- Répertoire de run symlinké : `LIFECYCLE_PURGE_STORAGE_INVALID`, cible externe conservée.

## Résultats

| Commande | Résultat |
|---|---:|
| `bun test apps/server/src/modules/retention/purge.test.ts` | 4 pass, 0 fail |
| `bun test apps/server/drizzle/lifecycle-purge.integration.test.ts --max-concurrency=1` | 8 pass, 0 fail |
| `bun run --filter server typecheck` | exit 0 |

La commande de preuve `bun run proof:g1-006e` regroupe ces deux fichiers : **12 pass, 0 fail,
48 assertions**.

La preuve est locale et ne constitue ni P-OPS, ni backup externe, ni acceptation Gate 1.
