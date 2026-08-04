# Registre des incohérences entre les stories et l'application

- **Établi le :** 04-08-2026
- **Méthode :** confrontation des états déclarés dans `TRACEABILITY.md` et les documents de gate au
  code réellement présent, à l'historique git et à l'exécution des tests.
- **Base factuelle :** `bun test` sur le commit `ab8af6c`, `bun run typecheck`, `git log`, inventaire
  des routes et modules.

Ce registre n'est pas une preuve au sens de `CONVENTIONS.md`. C'est un constat d'écart. Chaque entrée
nomme l'incohérence, la démontre par une citation vérifiable, et dit ce qui est gelé en conséquence.

## Vérité terrain au 04-08-2026

| Contrôle | Résultat |
|---|---|
| `bun run typecheck` | passe sur `@console/core`, `server`, `web` |
| `bun test` (exécution 1) | 593 tests, 586 pass, 3 skip, **4 fail** |
| `bun test` (exécution 2, même commit) | 593 tests, 588 pass, 3 skip, **2 fail** |

Les deux exécutions ont été lancées à la suite, sur le même commit et la même base PostgreSQL.

---

## INC-01 — La preuve `G1-005C` échoue et le contrôle fail-closed est ignoré

**Constat.** `proof:g1-005c` (`bun test apps/server/src/db/production-migration.test.ts`) échoue sur
deux tests :

```text
error: Database privilege classification missing for: hermes_releases, runtime_update_operations.
  at assertAllApplicationTablesAreClassified (apps/server/src/db/production-migration.ts:244)
(fail) production owner/runtime PostgreSQL boundary > migrates as owner and exposes only runtime DML plus the audited append function
(fail) production owner/runtime PostgreSQL boundary > upgrades an existing 0018 ledger and neutralizes a hostile stale runtime role
```

**Ce n'est pas un test cassé.** `GATE-1-CONTRAT-EXPLOITATION.md:143` décrit explicitement que le
contrôle doit refuser « une table future non classifiée ». Le contrôle est fail-closed, il s'est
déclenché comme spécifié, et il a été laissé rouge.

**Cause.** Les migrations `apps/server/drizzle/0034_hermes_releases.sql` et
`0035_runtime_update_operations.sql` créent deux tables jamais déclarées dans
`MUTABLE_APPLICATION_TABLES` (`apps/server/src/db/production-migration.ts:7`) ni dans
`PROTECTED_APPLICATION_TABLES` (`:36`).

**Écart documentaire.** `US-G1-005` était déclarée `IMPLÉMENTÉE` sur la foi d'une preuve datée du
01-08-2026, alors que le code l'a invalidée depuis.

**Action prise.** `US-G1-005` passe à `BLOQUÉE` dans `GATE-1-CONTRAT-EXPLOITATION.md` et
`TRACEABILITY.md`. La correction elle-même (classer les deux tables) est une décision de sécurité :
elle exige de trancher si ces tables sont mutables ou protégées, ce qui n'est pas un arbitrage de
documentation.

---

## INC-02 — Deux fonctionnalités livrées sans aucune story

Aucun document de story ne mentionne ces fonctionnalités, ni en français ni en anglais. Elles sont
pourtant complètes : back, front, migrations, tests.

| Fonctionnalité | Artefacts constatés |
|---|---|
| `updates` | `apps/server/src/modules/updates/{hermes-releases.ts,github-hermes-releases.ts}`, routes `/api/runtime/update`, `/api/runtime/update/[operationId]`, `/api/runtime/update/[operationId]/events`, `/api/updates/hermes`, migrations `0034`/`0035`, entrée de navigation `/updates`, script `apps/server/scripts/sync-hermes-releases.ts` |
| `skills` | `apps/server/src/api/skills/route.ts`, `apps/server/src/api/skills/toggle/route.ts`, `apps/server/src/modules/runtime/hermes-skills-admin.ts` (+ test), écran `apps/web/src/screens/skills.tsx`, entrée de navigation `/skills` |

**Pourquoi c'est grave ici.** Le dépôt applique une méthode où aucune capacité n'est acceptable sans
story, scénarios positif et négatif, et preuve datée. Ces deux fonctionnalités échappent entièrement
au dispositif. `updates` est de surcroît la cause directe d'INC-01 : elle a introduit deux tables qui
ont fait tomber une frontière de sécurité prouvée.

**Gel.** Tant qu'aucune story ne les couvre, ces deux fonctionnalités ne peuvent être invoquées dans
aucune preuve ni dans aucune revue de gate. Elles ne sont pas retirées du code, mais elles sont hors
périmètre d'acceptation.

**Décision requise.** Écrire les stories manquantes, ou décider explicitement que ces fonctionnalités
sont hors méthode et le tracer. Les identifiants de story ne sont pas inventés ici : c'est un choix
de périmètre produit.

---

## INC-03 — La discipline de traçabilité des commits est abandonnée depuis le 02-08-2026

Jusqu'au 01-08-2026 inclus, chaque commit porte sa story :

```text
78dad6e 2026-08-01 feat([user-story G1-005C]): prove PostgreSQL ledger immutability
5f6d0b7 2026-08-01 feat([user-story G1-004C]): enforce persisted approval before Hermes relay
a3112ee 2026-08-01 feat([user-story G1-004B]): make approval claims durable
```

À partir du 02-08-2026, la convention disparaît :

```text
5cfabda 2026-08-02 chore: checkpoint current web and runtime work
4d8962c 2026-08-02 feat(web): reorganize navigation and add session audit views
85d28cd 2026-08-04 fix: unblock update runtime types, nav typing and route manifest test
ea88908 2026-08-04 chore: aggregate gate-1/2 runtime hardening and updates feature work
```

**Conséquence.** Le code livré depuis le 02-08 n'est rattachable à aucune story par l'historique. Le
mot `aggregate` dans `ea88908` signale explicitement un commit fourre-tout mêlant Gate 1, Gate 2 et
la fonctionnalité `updates`. La traçabilité `story → commit → preuve` est rompue sur cette période.

---

## INC-04 — Le front a été remplacé sans rejouer les preuves d'interface

`apps/console` a été supprimé dans `5cfabda` (« chore: checkpoint current web and runtime work »,
02-08-2026), et remplacé par `apps/web`. L'historique compte 212 fichiers `apps/console` touchés sur
cette période.

Les preuves Gate 2 du 01-08-2026 déclarent pourtant l'interface vérifiée, par exemple `US-G2-003` :
« `IMPLÉMENTÉE` backend/DB/UI et vérifiée localement par P-CODE/P-INT ». Cette vérification portait
sur une application qui n'existe plus.

**Nuance, à décharge.** Aucun document ne cite de chemin `apps/console`, donc aucun lien n'est cassé
et la documentation n'est pas factuellement fausse sur ce point. Ce qui manque, c'est la re-preuve :
rien n'établit que `apps/web` reproduit les garanties d'interface constatées sur `apps/console`.

**Gel.** Le volet UI des preuves Gate 2 antérieures au 02-08-2026 est considéré comme non rejoué.
Les états backend/DB de ces stories ne sont pas remis en cause par ce constat.

---

## INC-05 — La suite de tests n'est pas déterministe

Deux exécutions consécutives de `bun test`, même commit `ab8af6c`, même base : **4 échecs** puis
**2 échecs**. Seuls les deux échecs de `production-migration.test.ts` (INC-01) sont reproductibles.

Deux tests ont donc changé de résultat sans que le code change. Tant que ce n'est pas élucidé, la
suite ne peut pas servir de critère d'acceptation : `VÉRIFIÉE` exige que « tous les tests exigés
passent », ce qui suppose un résultat stable.

La première exécution ayant été tronquée à la capture, l'identité des deux tests instables n'est pas
établie. C'est la première chose à instrumenter.

---

## INC-06 — Un harness de preuve a été modifié après la preuve qu'il a produite

`apps/server/scripts/prove-g1-007a-local.ts` a pour dernier commit le 02-08-2026, alors que la preuve
qu'il justifie est datée du 01-08-2026
(`evidence/2026-08-01-gate-1-g1-007a-post-setup-local.md`).

Le rapport archivé n'a donc pas été produit par le harness courant. `CONVENTIONS.md:60` exige que les
preuves soient reproductibles ; ici, rejouer le harness ne redonne pas nécessairement le rapport
archivé.

**Gel.** La preuve `G1-007A` est considérée comme non reproductible en l'état. `US-G1-007` reste
`IMPLÉMENTÉE` localement, mais son sous-slice `G1-007A` doit être rejoué avant toute revue.

---

## Ce que ce registre ne dit pas

- Les chemins cités par la documentation existent : 59 des 63 chemins référencés résolvent, et les 4
  restants sont des noms d'exemple dans des blocs de code, pas des citations.
- Gate 0 et Gate 3 sont cohérentes : toutes leurs stories sont `PROPOSÉE` et aucun code correspondant
  n'existe. Aucune revendication excessive n'a été trouvée de ce côté.
- `bun run typecheck` passe sur les trois workspaces. Il n'y a pas de dette de typage masquée.
- Aucune correction de code n'a été appliquée. Ce document constate, il ne répare pas.

## Suites proposées, par ordre de coût croissant

1. Classer `hermes_releases` et `runtime_update_operations`, rejouer `proof:g1-005c`, rendre
   `US-G1-005` à son état antérieur. Décision de sécurité, pas de documentation.
2. Identifier les deux tests instables d'INC-05 en capturant une sortie complète sur plusieurs
   exécutions.
3. Trancher le sort des fonctionnalités `updates` et `skills` : stories à écrire, ou hors méthode
   assumé et tracé.
4. Rejouer `G1-007A` avec le harness courant.
5. Décider si le volet UI de Gate 2 doit être re-prouvé sur `apps/web`.
