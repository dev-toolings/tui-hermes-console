# Recette locale — G1-006D2 — backup disaster-recovery et restauration scratch

Cette tranche prouve uniquement le contrat local d’un backup PostgreSQL + `files-data` vers une
cible scratch neuve. Elle ne constitue pas une sauvegarde externe, une perte d’hôte, une preuve
P-OPS/P-SEC ni une acceptation Gate 1.

## Ce qui est capturé

- un dump PostgreSQL `pg_dump -Fc` dans un conteneur éphémère ;
- une archive tar du répertoire `files-data` fixture ;
- un manifeste canonique versionné avec migrations, compteurs de tables, tailles et SHA-256 ;
- aucune métadonnée de mot de passe, token, clé ou secret dans l’enveloppe du bundle ; les octets
  du dump/tar ne sont pas inspectés pour détecter des secrets applicatifs.

Le contrat pur est dans [`dr-bundle.ts`](../../../apps/server/src/modules/retention/dr-bundle.ts).
Il vérifie les digests avant restauration, refuse les champs inconnus et les manifestes non
canoniques, exige une cible vide et expose un plan de rollback où la source doit rester inchangée.
Le SHA-256 est un digest d’intégrité, pas une signature d’authenticité : la vérification doit
recevoir le digest externe attendu (`verifyDrBundle(bundle, expectedSha256)`). Sans cette valeur
hors bande, un attaquant qui réécrit tout le JSON pourrait recalculer les digests.

## Exécuter la preuve

```sh
bun run proof:g1-006-dr
RUN_G1_006_DR=1 bun test apps/server/drizzle/lifecycle-dr.integration.test.ts
```

Le harness crée deux conteneurs PostgreSQL préfixés `hc-g1-006d2-*`, restaure le dump et l’archive
dans le second, compare l’inventaire source/scratch, rejoue les altérations du dump et du manifeste,
refuse une cible occupée, vérifie l’artefact restauré, puis détruit exclusivement les ressources
éphémères. Toute erreur de Docker est signalée ; aucun fallback silencieux n’annonce un succès.

## Limites et statut

- fixture PostgreSQL synthétique, pas l’installation Console complète ;
- aucune destination externe distincte ;
- aucune perte d’hôte, rotation de clé ou exercice de rollback opérateur ;
- aucune preuve P-OPS/P-SEC/P-E2E et aucun reviewer indépendant ;
- G1-006 complète et Gate 1 restent ouvertes.
