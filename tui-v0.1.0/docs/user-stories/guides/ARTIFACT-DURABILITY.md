# G1-001 — preuve de durabilité des artefacts

Le harness `apps/server/scripts/prove-artifact-durability.ts` vérifie la custody locale déclarée par
`compose.prod.yml` sans utiliser de données client. Il démarre un projet Docker explicitement nommé,
injecte une fixture synthétique, lit l’artefact par la vraie API, remplace le seul conteneur Console,
puis rejoue la lecture et les refus d’intégrité.

## Exécution

```sh
RUN_G1_001_COMPOSE=1 bun test apps/server/src/db/artifact-durability-compose.test.ts
```

Le test skippe si Docker n’est pas disponible ou si `RUN_G1_001_COMPOSE` n’est pas défini. Un skip ne
vaut jamais preuve. Le runner nettoie uniquement le projet `hc-g1-001-<pid>-<8 hex>` qu’il a créé,
avec `down --volumes --remove-orphans`; il n’utilise aucune commande `prune`.

## Verdict attendu

- `200` avant remplacement avec taille et SHA-256 attendus ;
- ID du conteneur Console différent après `--force-recreate` ;
- même volume nommé `<project>_files-data` monté sur `/data/files` ;
- `200` après remplacement avec les mêmes octets et le même hash ;
- `409 / ARTIFACT_INTEGRITY_FAILED` après corruption ;
- `410 / ARTIFACT_BYTES_MISSING` après suppression de la fixture ;
- nettoyage confirmé du projet Docker isolé.

## Limites

Cette preuve couvre le remplacement d’un conteneur sur le même hôte et le même volume Compose. Elle
ne prouve ni la sauvegarde atomique PostgreSQL + fichiers, ni la perte d’hôte, ni la restauration,
ni un stockage distant, ni l’acceptation P-OPS de production. Elle constitue une preuve locale
P-INT et une répétition opérationnelle locale ; G1-001 reste non acceptée tant qu’une recette
indépendante sur l’environnement de déploiement n’a pas été revue.
