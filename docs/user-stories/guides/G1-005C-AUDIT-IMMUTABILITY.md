# Guide de recette — G1-005C-local, immutabilité PostgreSQL du ledger

Ce sous-slice vérifie que le rôle applicatif de production peut lire le ledger et l'alimenter par la
fonction d'append contrôlée, sans pouvoir modifier directement ses entrées, sa tête ni utiliser
directement sa séquence ou
les protections PostgreSQL. Il ne constitue pas une revue P-SEC indépendante et ne ferme ni la
dépendance G1-004, ni Gate 1.

## Architecture

~~~text
╔══════════════════════╗  migrations owner + rôle séparé  ┌──────────────────────┐
║ PostgreSQL scratch   ║ ────────────────────────────────▶ │ hermes_runtime       │
╚══════════════════════╝                                   └──────────┬───────────┘
                                                                    │ altérations SQL · refus 42501
                                                                    ▼
                                                         ┌──────────────────────┐
                                                         │ Ledger préservé      │
                                                         │ + append contrôlé    │
                                                         └──────────────────────┘
~~~

Légende : les migrations sont appliquées avec l'identité propriétaire ; le rôle runtime tente les
altérations. Composants : PostgreSQL scratch, migrateur owner, rôle runtime et ledger d'audit.

## Exécution

~~~sh
bun run proof:g1-005c
~~~

Docker est obligatoire. Le test démarre un conteneur PostgreSQL éphémère
`hermes-db-roles-<suffixe>`, utilise l'image digestée du dépôt et supprime ce conteneur dans son
`afterAll`. Un skip Docker ne vaut jamais preuve.

## Critères vérifiés

- les URLs et identités owner/runtime doivent être distinctes ;
- le rôle runtime reste non-superuser, sans `CREATEDB`, `CREATEROLE`, `REPLICATION`, `BYPASSRLS`,
  héritage, membership ou objet possédé ;
- l'append applicatif passe uniquement par `append_audit_ledger_entry`, fonction `SECURITY DEFINER`
  au `search_path` pinné ;
- les `INSERT`, `UPDATE`, `DELETE` et `TRUNCATE` directs du ledger sont refusés avec SQLSTATE `42501` ;
- la mutation de la tête, du trigger et de la fonction, ainsi que l'accès/usage direct de la séquence et de
  `session_replication_role`, ainsi que `SET ROLE`, est refusée ;
- une table future non classifiée est inaccessible par défaut ;
- une mise à niveau depuis la migration 0018 termine une session runtime hostile, retire ses
  privilèges et réglages, conserve l'entrée historique puis append la séquence suivante ;
- le conteneur éphémère créé par le test n'est plus présent après la campagne.

## Limites

Cette preuve est P-INT locale sur PostgreSQL scratch. Elle ne démontre pas l'immutabilité face au
propriétaire de la base ou à l'infrastructure, ne remplace pas une revue indépendante P-SEC/P-E2E,
ne résout pas la dépendance G1-004 et ne vaut pas acceptation de Gate 1.
