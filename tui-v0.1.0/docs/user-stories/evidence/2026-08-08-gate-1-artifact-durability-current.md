# Preuve — durabilité locale des artefacts sur l'arbre courant

- **Date/heure :** 08-08-2026, Europe/Paris
- **Story :** `US-G1-001`
- **Base Git :** `b80a78652173d51e1b15a178eb4b5198d34135a8`
- **État exécuté :** worktree non commité incluant la suppression finale du workspace mobile et la
  régénération de `bun.lock`
- **Environnement :** Docker Engine `29.4.3`, Bun `1.3.13`, projet Compose local éphémère
- **Opérateur :** Codex
- **Reviewer indépendant :** non réalisé

## Préflight et correction

Le premier rejeu a échoué avant le scénario métier : `bun install --frozen-lockfile` voulait
modifier le lockfile dans le stage `build-deps`. Le manifeste racine ne déclarait plus
`apps/mobile`, mais `bun.lock` conservait encore sa fermeture Expo/React Native. Le lockfile a été
régénéré avec `bun install --lockfile-only`, retirant 1 028 lignes obsolètes. Le contrôle
`bun install --frozen-lockfile --lockfile-only` a ensuite réussi sans résolution supplémentaire.

Ce premier échec n'est pas compté comme preuve de durabilité. Il établit seulement que l'image de
production n'était plus reproductible avant la correction du lockfile.

## Exécution probante

Commande de validation du contrat :

```text
RUN_G1_001_COMPOSE=1 bun test apps/server/src/db/artifact-durability-compose.test.ts
```

Résultat : `1 pass`, `0 fail`, `6 expect() calls`, en `97.68 s`.

Le runner direct a ensuite produit la sortie structurée suivante sur cache chaud :

```text
status=PASS
project=hc-g1-001-2013726-b66d44ee
console.before=16a33721a4904b984e2fd8fb7a92f9c0f92dece2b5b042859fb3ccfd894a9ec2
console.after=b9ac11c3315858ca14900e625a6166148cc057b1bcc68e169177e43e8104d7ff
volume=hc-g1-001-2013726-b66d44ee_files-data
artifact.id=file_g1_001
artifact.size=24
artifact.sha256=7fea20d5c5bd6e291db6c1475484fc38ebad4bb768d983cbee44c53bea8ca91a
http.before=200
http.after=200
http.corrupt=409
http.missing=410
cleanup=confirmed
```

Le changement d'identifiant du conteneur prouve le remplacement. Le nom de volume, les 24 octets
et le SHA-256 restent identiques avant et après. Les scénarios négatifs refusent explicitement une
corruption (`409`) et des octets absents (`410`). Le projet Compose nommé a été supprimé avec ses
volumes et orphelins ; aucun `prune` global n'est utilisé.

## Image réellement produite

L'image `hermes-console:local` construite pendant la preuve est exécutée avec l'utilisateur `bun`.
Son contenu inspecté pèse `56 783 003` octets, soit `55 MiB` arrondis. Les deux couches applicatives
dominantes observées sont les dépendances runtime (`38.5 MB`) et le SPA (`9.24 MB`). Le budget de
contrôle de `500 MiB` passe. Cette mesure ne constitue pas une preuve de vitesse de déploiement.

## Limites et verdict

La preuve couvre un remplacement de conteneur sur le même hôte et le même volume Compose. Elle ne
couvre pas la perte d'hôte, une restauration de sauvegarde, la cohérence atomique PostgreSQL +
fichiers, ni l'acceptation P-OPS de production.

Verdict : `IMPLÉMENTÉE — preuve locale Compose rejouée sur l'arbre courant`. La revalidation locale
demandée après le retrait du transfert distant est acquise. La P-OPS de production et l'acceptation
par un reviewer indépendant restent ouvertes.

