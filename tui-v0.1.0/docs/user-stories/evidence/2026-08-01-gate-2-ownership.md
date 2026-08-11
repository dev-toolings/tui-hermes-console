# Preuve — Ownership explicite des ressources métier

- Date/heure UTC : 2026-08-01T11:29:52Z (campagnes ciblées complétées ensuite)
- Story : US-G2-003
- Commit/build : `2dc2399`, `ba81c37` (`fix(us-g2-003): close ownership race and revocation gaps`)
- Environnement : local, PostgreSQL Docker éphémère `postgres:17.6-alpine` épinglé par digest
- Opérateur : équipe Console
- Reviewer : Vador — contre-audit technique, verdict final à rattacher à la revue de Gate
- Versions Console/Hermes/PostgreSQL/OpenSSH : Console workspace courant ; PostgreSQL 17.6 Alpine

## Préconditions

- US-G2-001 et US-G2-002 présentes sur la branche dérivée de `main`.
- Migration 0021 appliquée après le journal 0020.
- Les campagnes utilisent des utilisateurs de sites distincts, cinq rôles et des données de deux
  sites (`paris`, `lyon`).
- Le protocole legacy exige une table de staging remplie par un opérateur avant migration : chaque
  auteur est explicite ; l'owner peut être implicite seulement pour un site avec exactement un
  administrateur désigné.

## Scénario positif

- Given : des agents, connecteurs, threads, runs et artefacts possèdent un `owner_user_id` et un
  `author_user_id` non nuls.
- When : un requester consulte son catalogue, un operator conserve la visibilité de site, puis un
  admin transfère un thread.
- Then attendu : les lectures requester sont owner-scoped ; le transfert est atomique sur
  `thread → runs → artifacts` ; l'auteur et le site restent immuables ; l'audit conserve
  `beforeState/afterState`.
- Résultat observé : **vert**.
- Preuve : `resource-ownership.integration.test.ts`, 9 tests, 59 assertions ; création d'agents,
  connecteurs, runs et artefacts auditée ; sortie runtime auditée avec l'auteur puis avec le
  propriétaire actif après révocation de l'auteur ; transfert et révocation de l'ancien owner
  vérifiés.

## Scénarios négatifs

### Lecture, commande, SSE et téléchargement hors périmètre

- Given : Alice vise les UUID de Bob ou des UUID aléatoires.
- When : GET thread/file/events, `/help`, message, upload et téléchargement sont tentés.
- Then attendu : même 404, audit de miss, aucun run/artefact/flux SSE démarré.
- Résultat observé : **vert** ; les chemins foreign/random sont comparés dans le P-INT.

### Transfert et membership

- Given : operator non propriétaire, cible cross-site, owner approver/auditor ou membership
  dégradée.
- When : transfert ou révocation directe est tenté.
- Then attendu : refus indistinguable, état inchangé, audit ; une ressource ne peut pas rester
  détenue par un rôle non éligible.
- Résultat observé : **vert** ; garde applicative, relecture/verrou de la membership acteur,
  contraintes et triggers SQL couvrent ces cas. Les triggers partagent un verrou advisory
  transactionnel `(site, user)` ; le scénario concurrent dégradation/création est couvert par le
  P-INT et la création est refusée après le commit de la dégradation.

### Migration legacy

- Given : ressources legacy depuis 0020, bootstrap complet/incomplet/ambigu, ou divergence d'un
  owner enfant.
- When : 0021 est appliquée, réappliquée ou rollbackée par transaction.
- Then attendu : upgrade complet et idempotent ; auteur absent, admins multiples ou divergence
  bloquent sans schéma partiellement migré.
- Résultat observé : **vert** ; 4 tests de migration, 12 assertions.

### Audit indisponible et effets disque

- Given : `APP_ENCRYPTION_KEY` absent pendant un transfert ou la création d'un output artifact.
- When : l'opération est exécutée.
- Then attendu : 503/échec, transaction DB rollbackée, owner inchangé et copie privée nettoyée.
- Résultat observé : **vert** dans le P-INT ownership.

## Commandes et sorties expurgées

```text
bun run typecheck                                      # core, server, console : vert
bun test apps/server/drizzle/resource-ownership.integration.test.ts
  9 pass · 59 assertions
# validation séparée (suite combinée sujette aux timeouts Docker historiques)
bun test apps/server/drizzle/site-role-authorization.integration.test.ts --max-concurrency=1
  7 pass · 145 assertions
bun test apps/server/drizzle/resource-ownership-migration.test.ts --max-concurrency=1
  timeout de readiness Docker lors de la campagne finale ; campagne précédente : 4 pass
git diff --check                                      # vert
```

Une campagne historique `bun test apps/server` avait produit 202 pass / 0 fail avant le dernier
durcissement. La relance globale finale a rencontré des courses de readiness entre plusieurs
fichiers Docker historiques (200 pass / 4 échecs d'infrastructure, aucun échec ciblé G2-003). Ce
résultat reste ouvert et ne vaut pas P-E2E.

## Invariants et limites

- `owner_user_id` et `author_user_id` sont `NOT NULL` ; owner FK composite vers la membership du
  même site ; auteur FK vers `console_users`.
- Runs héritent l'owner du thread ; artefacts héritent l'owner du run ; les FKs agrégées sont
  différables pendant un transfert.
- Site et auteur sont immuables par triggers SQL ; owner approver/auditor est refusé par la DB.
- Création et transfert utilisent le ledger append-only ; les sorties automatiques sont attribuées
  à l'auteur du run quand sa membership existe. Si l'auteur historique est révoqué avant la
  livraison, le propriétaire actif est utilisé comme acteur explicite avec un reason code dédié ;
  la copie est supprimée si l'audit échoue.
- Les caches UI sont namespacés par utilisateur/site, purgés sur logout/changement de site ; la
  vue montée revalide aussi les threads terminés toutes les 10 secondes et vide snapshot, refs,
  transcript local, mémoire et `sessionStorage` après 403/404.
- Le formulaire de migration exige une action opérateur explicite pour renseigner les auteurs
  historiques ; aucun créateur historique n'est inventé.
- P-E2E navigateur/multi-compte et acceptation produit/sécurité restent à exécuter. G2-005 policies
  et G2-006 OIDC entreprise sont explicitement hors périmètre de cette story.

## Nettoyage

- Les conteneurs PostgreSQL éphémères sont supprimés par les hooks de test.
- Les workdirs et sorties artificielles créés par le P-INT sont supprimés dans les `finally`.
- Aucun secret, cookie ou contenu client n'est conservé dans ce rapport.

## Verdict

**IMPLÉMENTÉE — techniquement vérifiée localement ; non ACCEPTÉE avant P-E2E et revue Gate 1.**

## Acceptation reviewer

- Nom/identifiant : à renseigner
- Date : à renseigner
- Décision : à renseigner (`ACCEPTÉE` | `REFUSÉE`)
