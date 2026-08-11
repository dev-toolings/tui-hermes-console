# Preuve locale — G1-006D2 — backup/restore disaster-recovery

- Date : 01-08-2026
- Story : préparation locale de US-G1-006
- Commit de base : `80caf4f`
- Environnement : Docker local, deux PostgreSQL éphémères, archive tar fixture
- Cible : scratch distincte, préfixe `hc-g1-006d2-*`
- Reviewer : responsable sécurité/exploitation distinct requis

## Résultat positif

```text
status=PASS
mode=ephemeral-postgres-and-files-fixture
sourceRowsBefore=1|1
sourceRowsAfter=1|1
scratchRows=1|1
```

Le dump `pg_dump -Fc` est restauré dans une base scratch neuve, l’archive `files-data` est extraite,
et l’empreinte de l’artefact est identique. Le manifeste, le dump et l’archive sont vérifiés avant
la mutation de la cible.

Le SHA-256 est utilisé comme digest d’intégrité ; le harness fournit le digest du bundle hors bande
à `verifyDrBundle`. Ce n’est pas une signature d’authenticité et ne constitue pas une preuve P-SEC.

## Refus exécutés

```text
dump altéré            -> DR_BUNDLE_DUMP_MISMATCH
manifest altéré        -> DR_BUNDLE_MANIFEST_MISMATCH
cible scratch occupée  -> DR_BUNDLE_TARGET_NOT_EMPTY
source après restore   -> inchangée
```

Le rapport expose le plan `freeze-source → drop-scratch-target → verify-source-digest`. Le nettoyage
supprime seulement les deux conteneurs et le répertoire temporaire préfixés par le harness.

## Limites / verdict

Cette preuve est une préparation P-CODE/P-INT locale sur fixture synthétique. Elle ne prouve ni une
destination externe, ni la perte d’un hôte, ni la restauration de l’installation Console complète,
ni P-OPS/P-SEC/P-E2E. Verdict : `BLOQUÉE` pour l’acceptation complète G1-006 et Gate 1.

## Acceptation reviewer

- Nom/identifiant : à renseigner
- Date : à renseigner
- Décision : ACCEPTÉE | REFUSÉE
