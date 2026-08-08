# Registre des incohérences entre les stories et l'application

- **Établi le :** 04-08-2026
- **Méthode :** confrontation des états déclarés dans `TRACEABILITY.md` et les documents de gate au
  code réellement présent, à l'historique git et à l'exécution des tests.
- **Base factuelle initiale :** `bun test` sur le commit `ab8af6c`, `bun run typecheck`, `git log`,
  inventaire des routes et modules.
- **Actualisation :** correctifs et parcours d'update rejoués le 04-08-2026 sur le worktree courant.

Ce registre n'est pas une preuve au sens de `CONVENTIONS.md`. C'est un constat d'écart. Chaque entrée
nomme l'incohérence, la démontre par une citation vérifiable, et dit ce qui est gelé en conséquence.

## Vérité terrain au 04-08-2026

| Contrôle | Résultat |
|---|---|
| Typechecks ciblés | `core`, `server` et `web` verts sur leurs commandes dédiées ; le typecheck agrégé conserve une erreur web préexistante d'import type-only dans `apps/web/src/components/shell/nav-main.tsx` (entrée close le 08-08-2026, voir « Ce que ce registre ne dit pas ») |
| `bun run proof:g1-005c` | 3 tests, 0 fail, 53 expect |
| Régression du rejeu runtime | 600 tests passés, 3 skips explicites, **0 fail** |

Les preuves de régression et de runtime sont datées du rejeu du 04-08-2026 ; les skips restent
explicitement environnementaux et ne sont pas comptés comme des succès.

## Décision de périmètre — SFTP gelé

Le transfert SFTP n'est pas retenu pour cette phase produit. `US-G1-SSH-006`, `US-G1-SSH-007` et
`US-G1-SSH-009` passent à l'état `GELÉE` : aucun développement, rejeu, preuve ou critère Gate 1 ne
doit leur être attribué. Le tunnel SSH, la confiance d'hôte et la rotation d'identité restent des
éléments actifs du sous-périmètre SSH.

---

## INC-01 — La preuve `G1-005C` échouait et le contrôle fail-closed était ignoré — CORRIGÉE

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

**Décision.** Les deux tables sont des tables applicatives mutables : `hermes_releases` est écrite
par la synchronisation des releases et `runtime_update_operations` par le workflow d'update. Elles
ne sont pas le ledger append-only et ont été ajoutées à `MUTABLE_APPLICATION_TABLES`.

**Résultat.** `bun run proof:g1-005c` repasse avec 3 tests, 0 échec et 53 assertions. La frontière
owner/runtime est donc restaurée pour ces tables ; P-SEC/P-E2E, revue indépendante et dépendance
US-G1-004 restent des réserves de Gate 1, pas l'INC-01.

---

## INC-02 — Une fonctionnalité livrée sans story — PARTIELLEMENT RÉSOLUE

Le constat initial portait sur `updates` et `skills`, toutes deux complètes côté back, front,
migrations et tests. `updates` est maintenant couverte par `US-G1-002D` et une preuve locale/Proxmox
réelle ; `skills` reste sans story.

| Fonctionnalité | Artefacts constatés |
|---|---|
| `updates` | `apps/server/src/modules/updates/{hermes-releases.ts,github-hermes-releases.ts}`, routes `/api/runtime/update`, `/api/runtime/update/[operationId]`, `/api/runtime/update/[operationId]/events`, `/api/updates/hermes`, migrations `0034`/`0035`, entrée de navigation `/updates`, script `apps/server/scripts/sync-hermes-releases.ts` — désormais couverte par `US-G1-002D` et sa preuve du 04-08-2026 |
| `skills` | `apps/server/src/api/skills/route.ts`, `apps/server/src/api/skills/toggle/route.ts`, `apps/server/src/modules/runtime/hermes-skills-admin.ts` (+ test), écran `apps/web/src/screens/skills.tsx`, entrée de navigation `/skills` |

**Pourquoi c'est grave ici.** Le dépôt applique une méthode où aucune capacité n'est acceptable sans
story, scénarios positif et négatif, et preuve datée. `skills` échappe encore au dispositif. `updates`
reste la cause directe d'INC-01 : elle a introduit deux tables qui ont fait tomber une frontière de
sécurité prouvée, frontière désormais corrigée.

**Gel.** `skills` ne peut pas être invoquée dans une preuve ni une revue de gate tant qu'une story ne
la couvre pas. `updates` peut être examinée pour sa partie technique, mais reste `IMPLÉMENTÉE` et non
`VÉRIFIÉE` jusqu'à la revue indépendante et au P-E2E Gate 1.

**Décision requise.** Le propriétaire produit doit écrire la story `skills` ou la déclarer
explicitement hors méthode. `US-G1-002D` est le rattachement retenu pour `updates`.

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

## INC-05 — La suite de tests n'était pas déterministe — CORRIGÉE

Les échecs variables venaient des intégrations PostgreSQL Docker qui considéraient `pg_isready` vert
pendant le serveur temporaire d'initialisation, juste avant son arrêt et le démarrage final. Les
premiers `psql` tombaient alors sur une socket absente.

Les sondes des intégrations concernées attendent maintenant une vraie requête `psql SELECT 1`.
Deux exécutions complètes consécutives du worktree courant passent : **590 pass, 3 skip, 0 fail**
sur 593 tests. INC-05 est corrigée ; les trois skips restent explicitement hors environnement local.

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

## INC-07 : deux échecs serveur intermittents, non identifiés

**Ouverte le 08-08-2026.**

`bun run test` a rapporté `446 pass, 2 fail` sur 451 tests. **Six exécutions complètes** lancées
ensuite, dont trois avec la sortie intégralement conservée, ont toutes rendu `0 fail`. Les deux tests
en cause **n'ont pas été identifiés** : le filtre de sortie appliqué à l'exécution en échec était trop
étroit et leur nom a été perdu. Il ne s'agit pas d'une hypothèse rassurante, c'est une information
manquante. Un taux d'apparition d'environ une exécution sur sept est cohérent avec une condition de
course, et rend la capture par simple répétition peu efficace.

Deux échecs intermittents avaient déjà été observés en début de journée, sur des symptômes de
contrainte PostgreSQL (`runtime_config_workspace_status_check ... does not exist, skipping`), sans
qu'il soit établi qu'il s'agisse des mêmes. Ces messages sont des `NOTICE` émis par un
`DROP CONSTRAINT IF EXISTS` de nettoyage entre tests, donc probablement pas la cause.

Piste privilégiée : la suite serveur lance des conteneurs PostgreSQL éphémères dans **15 fichiers de
test**, chacun avec son propre conteneur nommé. Une contention de ressources au démarrage
expliquerait un échec non reproductible.

**Un nom capturé le 08-08-2026.** Une septième exécution a produit un échec identifié :

```
(fail) audit ledger migration on PostgreSQL > 0018 replays and enforces actor snapshots,
       target ordering, and mutation guards   [5912.09ms]
apps/server/drizzle/audit-ledger-migration.test.ts
```

Élément discriminant : ce test passe systématiquement **seul**, en 9 secondes environ, et n'a échoué
que dans la suite complète, en 5,9 secondes, soit avant son temps nominal. Un échec plus rapide que
le succès oriente vers un conteneur non prêt au moment de la première requête, pas vers une
assertion fausse. La piste de contention est donc renforcée, sans être démontrée.

Le second test en échec reste inconnu.

**Action requise avant toute revue de Gate :** capturer les noms des tests concernés. La répétition
seule ayant échoué sur six exécutions, viser la cause plutôt que l'occurrence : conserver
systématiquement la sortie complète du harness, et exécuter la suite serveur seule, sans parallélisme
inter-workspaces, pour déterminer si la contention de conteneurs est bien en jeu. Une suite dont deux
échecs sur 451 restent anonymes ne permet pas de signer un rapport d'acceptation de bonne foi.

---

## Ce que ce registre ne dit pas

- Les chemins cités par la documentation existent : 59 des 63 chemins référencés résolvent, et les 4
  restants sont des noms d'exemple dans des blocs de code, pas des citations.
- Gate 0 et Gate 3 sont cohérentes : toutes leurs stories sont `PROPOSÉE` et aucun code correspondant
  n'existe. Aucune revendication excessive n'a été trouvée de ce côté.
- Les typechecks ciblés `core`, `server` et `web` ont été rejoués ; le typecheck agrégé conserve
  l'erreur web import type-only déjà signalée dans la vérité terrain ci-dessus.
- **Close le 08-08-2026.** `bun run --cwd apps/web typecheck` et `bun run typecheck` (agrégé, tous
  workspaces) passent tous deux sans erreur. L'erreur d'import type-only sur `nav-main.tsx` n'est plus
  reproductible ; cette entrée est conservée pour l'historique, elle ne décrit plus l'état courant.
- Les corrections appliquées sont documentées ici et dans les preuves datées ; ce registre conserve
  les constats historiques pour expliquer les changements d'état.

## Suites proposées, par ordre de coût croissant

1. Faire la revue indépendante et le P-E2E Gate 1 de `US-G1-002`/`US-G1-002D`.
2. Trancher le sort de `skills` : story à écrire, ou hors méthode assumé et tracé.
3. Rejouer `G1-007A` avec le harness courant.
4. Décider si le volet UI de Gate 2 doit être re-prouvé sur `apps/web`.
