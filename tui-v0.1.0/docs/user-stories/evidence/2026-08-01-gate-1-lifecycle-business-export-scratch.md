# Preuve locale — G1-006D-local — business-export scratch

- Date/heure UTC : 2026-08-01
- Type : P-INT PostgreSQL Docker + filesystem scratch
- Test : `apps/server/drizzle/lifecycle-restore.integration.test.ts`
- Résultat : 3 pass, 0 fail, 13 assertions
- Script de replay : `apps/server/scripts/restore-lifecycle-scratch.ts`

## Résultat observé

Le test restaure dans une base scratch contenant déjà le site et l’identité de
fixture :

- 1 thread, 1 run, 1 message et 1 événement, avec leurs corrélations ;
- 1 artefact de 22 octets, relu depuis le répertoire scratch et vérifié par
  SHA-256 ;
- l’identifiant d’événement 42, malgré la colonne PostgreSQL identity, grâce à
  `OVERRIDING SYSTEM VALUE` puis resynchronisation de séquence.

Les cas négatifs couvrent :

- bundle altéré ou manifeste incomplet ;
- site de cible différent ;
- répertoire d’artefacts déjà occupé ;
- base métier déjà peuplée, sans écrasement.

## Limites et verdict

Cette preuve est un restaurateur **d’export métier vers scratch**. Elle ne
restaure pas l’installation complète (sites, identités, agents, policies,
ledger/audit) et ne vaut donc pas backup disaster-recovery. Aucun VPS, volume
de production, appel externe, suppression ou purge n’a été utilisé.

Verdict : `IMPLÉMENTÉE LOCALE — business-export scratch uniquement` ; US-G1-006D,
P-OPS et P-SEC restent ouverts.
