# Recette locale — Hermes confiné (US-G1-002A)

Cette recette active explicitement le runtime Hermes géré par la Console. Elle ne modifie pas un
runtime distant déjà configuré et ne transforme pas une preuve locale en acceptation de sécurité.

## Préparer l'overlay

L'image Hermes doit être fournie avec un digest immuable et un fichier de secret hors du dépôt :

```sh
export HERMES_IMAGE='registry.example.invalid/hermes:VERSION@sha256:<64-hex-digits>'
export HERMES_RUNTIME_TOKEN_FILE=/secure/hermes/runtime-token
chmod 0600 "$HERMES_RUNTIME_TOKEN_FILE"
docker compose --env-file deploy/production.env \
  -f compose.prod.yml -f compose.prod.hermes-managed.yml config --quiet
```

L'overlay est opt-in. Il ajoute le service `hermes` sur un réseau interne, rattache la Console à ce
réseau, et ne publie aucun port Hermes. Le service impose `65532:65532`, `read_only`,
`no-new-privileges`, `cap_drop: ALL`, un workdir persistant `/work`, des tmpfs éphémères et des
limites CPU/mémoire/PID. La socket Docker, des chemins hôte arbitraires et les secrets d'un autre
workflow ne sont jamais montés.

## Démarrer explicitement

```sh
docker compose --env-file deploy/production.env \
  -f compose.prod.yml -f compose.prod.hermes-managed.yml up -d --build
```

Pour un runtime distant, ne passez pas cet overlay : gardez la configuration directe ou SSH existante
et recueillez les preuves propres à cette cible.

## Harness local

Le harness vérifie le manifeste Compose puis exécute quatre sondes dans une fixture locale : écriture
du workdir autorisée, écriture de la racine refusée, socket Docker absente/inaccessible, chemin hôte
non monté absent et secret d'un autre workflow absent.

```sh
HERMES_CONFINEMENT_FIXTURE_IMAGE='registry.example.invalid/fixture@sha256:<64-hex-digits>' \
HERMES_RUNTIME_TOKEN_FILE=/secure/hermes/runtime-token \
bun run proof:g1-002a
```

La sortie `PASS` signifie uniquement « manifeste + fixture locale ». La fixture n'est pas Hermes et
ne couvre ni une identité de process sur la cible, ni une tentative réelle contre le socket Docker,
ni la robustesse après redémarrage.
