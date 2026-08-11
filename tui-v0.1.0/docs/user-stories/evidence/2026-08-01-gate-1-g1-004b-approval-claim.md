# Preuve locale — US-G1-004B — claim d’approbation fidèle

- **Date :** 01-08-2026
- **Environnement :** Bun + PostgreSQL Docker éphémère
- **Scope :** service d’approbation Console, `runs`, audit ledger
- **Verdict :** `IMPLÉMENTÉE LOCALE` — US-G1-004 complète reste `BLOQUÉE`

## Scénario positif

Deux appels concurrents ciblent le même run `awaiting_approval`. Le compare-and-set SQL réclame le
run une seule fois, un seul POST `/v1/runs/:id/approval` est observé, l’audit `allowed` est écrit
après le retour Hermes et le second appel reçoit `RUN_NOT_AWAITING_APPROVAL`.

## Scénarios négatifs

- `deny` produit une entrée `denied` avec `RUN_APPROVAL_DENIED`, jamais `allowed`.
- Une erreur Hermes HTTP 4xx libère le run, produit `RUN_APPROVAL_REMOTE_FAILED` en `denied` et
  n’écrit aucune décision `allowed`.
- Une coupure après envoi conserve le `approval_claim_id`, produit `RUN_APPROVAL_REMOTE_UNKNOWN` et
  empêche une deuxième décision tant que la réconciliation n’a pas confirmé l’état Hermes.
- Un claim déjà consommé n’appelle pas Hermes.
- Les rôles non approbateurs restent refusés par la matrice d’autorisation ; les tests de contexte
  direct utilisent un compte `approver` réel de la fixture pour isoler la portée site.

## Résultats observés

| Commande | Résultat |
|---|---:|
| `bun test apps/server/src/modules/runs/respond-approval.test.ts` | 8 pass, 0 fail |
| `bun test apps/server/drizzle/site-context-api.integration.test.ts --max-concurrency=1` | 4 pass, 0 fail |
| `bun test apps/server/drizzle/site-role-authorization.integration.test.ts --max-concurrency=1` | 13 pass, 0 fail |
| `bun run --filter server typecheck` | exit 0 |

La passe combinée (les trois fichiers ci-dessus, `--max-concurrency=1`) donne **25 pass, 0 fail,
274 assertions**.

## Limites et décision

La policy signée `fixture.marker.write` de G1-004A n’est toujours pas branchée à `runner.ts` ou à
l’adaptateur Hermes. Cette preuve ne vaut donc ni P-SEC indépendante, ni P-E2E/P-OPS, ni acceptation
Gate 1.
