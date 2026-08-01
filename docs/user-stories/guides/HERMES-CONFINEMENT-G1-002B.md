# Recette locale — image Hermes réelle (US-G1-002B)

Cette recette vérifie la compatibilité de l’overlay de confinement avec une image Hermes upstream
réellement tirée par digest. Elle ne transforme pas une preuve locale en acceptation P-SEC/P-OPS/P-E2E.

## Exécution

Utiliser une référence AMD64 `image@sha256:digest`, jamais un tag mutable :

```sh
HERMES_REAL_IMAGE='nousresearch/hermes-agent@sha256:<manifest-amd64>' \
HERMES_REAL_PULL=1 \
bun run proof:g1-002b
```

Le script inspecte la configuration OCI, exécute la commande de version avec les permissions
minimales nécessaires à l’image, rejoue l’overlay Console actuel (`65532:65532`, rootfs RO,
`cap_drop: ALL`, `no-new-privileges`), puis vérifie séparément l’écriture rootfs refusée, l’absence
de socket Docker/chemin hôte/secret étranger et la persistance d’un marqueur sous `/opt/data` après
remplacement du conteneur.

## Règle de décision

- `PASS` signifie que l’image exacte respecte le contrat local et que les sondes ont réussi.
- `BLOCKED` est le résultat attendu si la version, l’utilisateur, le workdir ou le démarrage réel ne
  correspondent pas ; le code de sortie est non nul pour empêcher une promotion silencieuse.

La version attendue par le PRD reste `0.19.0` tant qu’une décision produit ne l’a pas révisée. Le
script ne modifie jamais le PRD pour suivre `latest`.

## Limites

La preuve est locale Docker uniquement. Elle ne fournit ni revue indépendante P-SEC, ni P-OPS sur
une cible de production, ni appel à un provider Hermes, ni acceptation Gate 1. Une image upstream
qui démarre un superviseur root ou persiste sous `/opt/data` doit être adaptée par une image dérivée
explicitement approuvée ; l’overlay ne doit pas être assoupli silencieusement.
