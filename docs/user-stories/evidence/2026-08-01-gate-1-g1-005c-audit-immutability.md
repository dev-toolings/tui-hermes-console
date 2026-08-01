# Preuve locale — US-G1-005C — immutabilité PostgreSQL du ledger

- **Date :** 01-08-2026
- **Story :** `US-G1-005C-local`, sous-slice de `US-G1-005`
- **Base exécutée :** `586bf49` avec la commande G1-005C du worktree
- **Environnement :** Bun `1.3.13`, Docker Engine `29.4.3`, PostgreSQL scratch `17.6-alpine`
- **Image PostgreSQL :**
  `postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94`
- **Commande :** `bun run proof:g1-005c`
- **Résultat :** `3 pass`, `0 fail`, `0 skip`, `53 expect() calls`, 1 fichier, `3.07s`

Les messages PostgreSQL `NOTICE ... skipping` proviennent des clauses idempotentes des migrations ;
aucun test Bun n'a été skippé.

## Frontière positive

La migration de production crée des identités owner/runtime distinctes. Le rôle `hermes_runtime`
reste non-superuser, sans privilège de création, réplication, bypass RLS, héritage, membership ou
objet possédé. Il peut lire le ledger et ajouter une entrée uniquement via
`append_audit_ledger_entry`, fonction `SECURITY DEFINER` au `search_path` pinné. L'append produit la
séquence 1 et avance la tête à 2.

## Tentatives refusées

Depuis le rôle runtime, les opérations suivantes échouent avec SQLSTATE `42501` :

- `INSERT`, `UPDATE`, `DELETE` et `TRUNCATE` directs sur `audit_ledger_entries` ;
- insert/update directs sur `audit_ledger_heads` ;
- création d'une table, désactivation du trigger et renommage de la fonction de chaîne ;
- accès direct à `audit_ledger_entries_id_seq` ;
- `SET session_replication_role = replica` et `SET ROLE postgres` ;
- lecture ou écriture d'une future table non classifiée.

## Mise à niveau hostile

La seconde campagne part d'un ledger 0018 et d'un rôle runtime volontairement hostile : superuser,
membership propriétaire, paramètres `session_replication_role`, privilèges directs et session active.
La migration termine cette session, retire les attributs, memberships, réglages et privilèges, conserve
l'événement historique puis append un nouvel événement en séquence 2. Le rôle réconcilié ne peut plus
réactiver les chemins de contournement.

## Nettoyage observé

~~~text
containers before matching ^hermes-db-roles- : 0
containers after  matching ^hermes-db-roles- : 0
test_status=0
~~~

Le conteneur PostgreSQL éphémère créé par le test a donc été supprimé. Aucun volume ou conteneur
global n'a été pruné.

## Verdict et limites

`US-G1-005C-local` est **VÉRIFIÉE pour P-INT locale**. Cette preuve démontre la frontière du rôle
applicatif PostgreSQL, pas l'immutabilité face au propriétaire de la base ou à l'infrastructure. Elle
ne remplace ni une revue indépendante, ni P-SEC/P-E2E, ne résout pas la dépendance G1-004 et ne vaut
pas acceptation de Gate 1.

G2-005 et G2-006 n'ont pas été modifiées.
