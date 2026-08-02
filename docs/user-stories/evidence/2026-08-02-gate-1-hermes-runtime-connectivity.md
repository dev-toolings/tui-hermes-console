# Preuve — G1-007B connectivité Hermes native, Docker locale et Docker VPS

- **Date/heure UTC :** 02-08-2026, 09:37–11:18 UTC
- **Story :** `US-G1-007B-runtime-connectivity`, sous-slice de `US-G1-007` et preuve partielle de
  `US-G1-008`
- **Commit/build :** worktree propre au départ sur `78dad6e`, build Vite exécuté avant la recette
- **Environnements :** poste local Linux, Docker local, VPS existant Debian 13
- **Opérateur :** opérateur du dépôt
- **Reviewer :** non réalisé
- **Versions :** Console Bun `1.3.13`, Hermes natif `0.19.0`, Hermes Docker `0.19.1`
- **Verdict :** `VÉRIFIÉE` pour la connectivité de ce slice ; `US-G1-007`, `US-G1-008` et Gate 1
  restent ouvertes

## Contrat du slice

> En tant qu'opérateur, je veux laisser la Console active en arrière-plan et sonder le même contrat
> Hermes en installation native, en conteneur local ou derrière un tunnel SSH, afin de distinguer
> une cible réellement exploitable d'une simple présence de processus.

- **Given :** une Console compilée, un Hermes natif local, un Hermes Docker local et un VPS joignable
  par une identité SSH déjà autorisée.
- **When :** la Console démarre comme unité utilisateur et `runtime:probe` appelle `/health` puis
  `/v1/capabilities`, directement ou via le transport SSH du projet.
- **Then :** les deux endpoints répondent avec un statut sain, une version et les capabilities ; le
  runtime VPS reste lié à loopback et redémarre automatiquement.
- **Négatif :** un token périmé a retourné `401` sur le Hermes natif avant la correction de
  l'environnement du service ; aucun succès n'a été fabriqué et aucun secret n'a été imprimé.

## Résultats observés

| Cible | Transport | Résultat | Version | Persistance / exposition |
|---|---|---|---|---|
| Hermes natif local | HTTP loopback | health + capabilities OK | `0.19.0` | unité `hermes-gateway` active |
| Hermes Docker local | HTTP loopback `:18642` | health + capabilities OK | `0.19.1` | `restart=unless-stopped` |
| Hermes Docker VPS | module system-SSH du projet vers loopback `:8642` | health + capabilities OK | `0.19.1` | `restart=unless-stopped`, bind `127.0.0.1` |
| Console locale | HTTP `:3170` | `/api/healthz` et SPA `200` | build courant | unité utilisateur `Restart=on-failure` |

La sonde a confirmé notamment `run_submission`, `run_status`, `run_events_sse`, `run_stop`,
`run_approval_response`, `approval_events`, `responses_api` et `skills_api` sur les trois runtimes.

## Commande reproductible

La commande ne journalise ni token ni mot de passe. Les secrets sont fournis par l'environnement :

```bash
HERMES_BASE_URL=http://127.0.0.1:8642 \
HERMES_RUNTIME_TOKEN='<secret>' \
bun run runtime:probe
```

Pour le VPS :

```bash
HERMES_TRANSPORT=ssh \
HERMES_BASE_URL=http://127.0.0.1:8642 \
HERMES_RUNTIME_TOKEN='<secret>' \
HERMES_SSH_HOST='<host>' \
HERMES_SSH_USER='<user>' \
bun run runtime:probe
```

Sortie expurgée observée :

```json
{"ok":true,"transport":"ssh","target":"ssh-loopback","health":{"status":"ok","platform":"hermes-agent","version":"0.19.1"}}
```

## Déploiement VPS observé

- image demandée par digest de manifeste :
  `nousresearch/hermes-agent@sha256:8aab4fb9665995cafc118546d071caf7b12fc36ef038dbb81bd4ca1cdb2a1ccc` ;
- volume durable dédié : `hermes-console-runtime-data` ;
- configuration API dans un fichier root-only hors dépôt ;
- port publié uniquement sur `127.0.0.1:8642` ;
- politique de reprise : `unless-stopped` ;
- le transport `createSystemSshChannel` du projet a établi le forward, puis
  `testHermesRuntimeAgainst` a validé les deux endpoints.

## Incidents et écarts

- Le premier lancement background de la Console échouait avec `bun: commande introuvable` : le
  service systemd minimal ne possédait pas le PATH interactif. L'appel du binaire Bun absolu a
  corrigé le démarrage ; l'original `/api/healthz` a ensuite répondu `200`.
- Le premier arrêt contrôlé restait en `deactivating` : le handler SSH interceptait `SIGTERM` pour
  fermer le ControlMaster sans quitter le processus. Le handler quitte désormais explicitement
  après cleanup ; la recette finale rejoue arrêt, fermeture du port, redémarrage et health.
- Le token de fallback de `apps/server/.env.local` était ancien et a produit `401` face au service
  Hermes natif. Le service background injecte le token de l'installation active sans modifier ni
  exposer le secret.
- Le VPS n'est pas vierge et la connexion utilise encore `root`; aucun compte de service, SFTP
  borné, `PermitOpen`, rotation/révocation, reprise concurrente ou confinement P-SEC n'est prouvé.
- L'image upstream démarre via un superviseur root avant d'exécuter Hermes sous son utilisateur ;
  cette preuve de disponibilité ne promeut pas l'overlay de confinement G1-002.
- OpenSSH signale l'absence de KEX post-quantique sur cette cible.

## Reproduction OAuth OpenAI Codex

Le premier verdict ne couvrait pas le parcours OAuth : il prouvait uniquement les endpoints
runtime. Une recette navigateur ciblée a ensuite reproduit deux défauts distincts :

1. le service background ne trouvait pas `hermes` car `~/.local/bin` était absent de son `PATH` ;
2. toutes les routes d'installation étaient refusées, y compris à l'unique opérateur autorisé.

Le service déclare maintenant `HERMES_CLI_PATH=/home/kev/.local/bin/hermes`. L'autorité
d'installation est séparée des rôles de site par `INSTALLATION_ADMIN_EMAILS`, avec un fallback
mono-admin uniquement lorsque `GOOGLE_ALLOWED_EMAILS` contient exactement une identité.

La recette finale a utilisé une session locale éphémère et le vrai écran `/settings/models` :

- navigation authentifiée vers la page : OK ;
- clic sur `Connecter mon abonnement` : OK ;
- démarrage de `hermes auth add openai-codex --no-browser` : OK ;
- URL OpenAI et code device-flow non vide affichés : OK, sans imprimer le code dans la preuve ;
- aucune alerte visible : OK ;
- annulation depuis l'UI et retour à l'état initial : OK.

L'utilisateur synthétique, sa session, le profil navigateur et la complétion temporaire du setup
ont été supprimés/restaurés après la recette. Cette preuve valide le démarrage du device flow réel ;
elle ne prétend pas avoir autorisé le compte OpenAI personnel de l'opérateur.

## Nettoyage et état laissé

- Console locale laissée active en background : `tui-hermes-console.service`.
- Hermes natif local laissé actif : `hermes-gateway.service`.
- Hermes Docker local laissé actif sur loopback `:18642` pour comparaison.
- Hermes Docker VPS laissé actif sur loopback `:8642` conformément à l'objectif opérationnel.
- Le ControlMaster ouvert par la sonde projet a été fermé explicitement après le probe.

## Verdict

`VÉRIFIÉE` pour `US-G1-007B-runtime-connectivity` : les quatre processus attendus sont réellement
actifs et les trois variantes Hermes ont répondu au contrat runtime du projet. Ce rapport est une
preuve P-INT/P-OPS ciblée, pas une acceptation de US-G1-002, US-G1-007, US-G1-008 ou Gate 1.

## Acceptation reviewer

- **Nom/identifiant :** à désigner
- **Date :** —
- **Décision :** non revue
