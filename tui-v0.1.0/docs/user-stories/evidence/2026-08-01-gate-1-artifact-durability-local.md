# Preuve — durabilité locale des artefacts après remplacement Compose

- Date/heure UTC : 2026-08-01 (exécution locale)
- Story : US-G1-001
- Commit/build : `db79b78e33fbe97ca9acece7c99cde4202049b63`
- Environnement : local Docker éphémère
- Opérateur : Codex
- Reviewer : à faire par un responsable sécurité/exploitation distinct
- Cible : projet Compose `hc-g1-001-2998754-044ea3db` (détruit après test)
- Versions : Docker Engine `29.4.3`, Docker Compose `v5.1.3`

## Préconditions

- Projet Compose temporaire préfixé `hc-g1-001-` ; aucun projet de production utilisé.
- Secrets et données entièrement synthétiques ; aucun fichier client.
- Services démarrés : PostgreSQL, migration one-shot et Console ; Caddy non démarré.
- Volume attendu : `<project>_files-data`, monté sur `/data/files`.

## Scénario positif

- Given : métadonnée `file_g1_001`, octets synthétiques de 24 octets et SHA-256
  `7fea20d5c5bd6e291db6c1475484fc38ebad4bb768d983cbee44c53bea8ca91a`.
- When : lecture par `GET /api/files/file_g1_001`, puis `docker compose up -d --no-deps
  --force-recreate console`.
- Then attendu : nouveau conteneur, même volume et mêmes octets vérifiés.
- Résultat observé :
  - conteneur avant : `424228079afe6f357713482a7941afda5daf8b3bffe95c46a7f7366d372fd17f` ;
  - conteneur après : `8a4660cc9803be3f09b61af99bae1ba92bd2d122087b8088f7739127eacbd1b7` ;
  - volume : `hc-g1-001-2998754-044ea3db_files-data` ;
  - HTTP avant/après : `200` / `200` ;
  - SHA et taille identiques avant/après.

## Scénarios négatifs

### Corruption

- Given : la fixture est remplacée par des octets différents.
- When : lecture API.
- Then attendu : aucun contenu n’est renvoyé comme succès.
- Résultat observé : `409 / ARTIFACT_INTEGRITY_FAILED`.

### Absence

- Given : la fixture est supprimée du volume.
- When : lecture API.
- Then attendu : absence explicite.
- Résultat observé : `410 / ARTIFACT_BYTES_MISSING`.

## Commandes et sorties expurgées

```text
$ bun run proof:g1-001
status=PASS
http.before=200 http.after=200 http.corrupt=409 http.missing=410
cleanup=confirmed
```

## Nettoyage

`docker compose down --volumes --remove-orphans` a été exécuté avec le project name explicite ; les
conteneurs, volume et réseau portant le label du projet ont été vérifiés absents.

## Écarts et limites

Cette preuve couvre le remplacement d’un conteneur sur le même hôte et le même volume Compose. Elle
ne couvre pas la perte d’hôte, la corruption de volume, la sauvegarde atomique PostgreSQL + fichiers,
la restauration, le stockage externe/SFTP ou l’acceptation P-OPS de production. Elle ne ferme pas
G1-006 ni G1-007.

## Verdict

`IMPLÉMENTÉE — preuve locale Compose` ; `P-OPS production` et l’acceptation Gate 1 restent ouvertes.

## Acceptation reviewer

- Nom/identifiant : à renseigner
- Date : à renseigner
- Décision : à renseigner
