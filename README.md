# Hermes Console Core

Couche d’exploitation agentique self-hosted : **control plane + surface de travail** autour d’un
runtime [Hermes Agent](https://github.com/NousResearch/hermes-agent) — créer un agent (identité
opérationnelle), lui confier une mission traçable, observer l’exécution, récupérer résultats et
artefacts. Sans CLI, sans imposer Telegram/WhatsApp comme interface client.

**Statut : v0.7 — Phase 3 ✅ + Phase 4 slice fichiers.** Agents, threads, runtime config,
cancel/retry/approvals, artefacts (`HERMES_SHARED_WORKDIR`). Axe produit v0.6 (généraliste
dynamique) : Buzz / Multica / hermes-webui = inspiration, pas clones — détail
[`docs/PRD.md`](docs/PRD.md) + [`PRODUCT.md`](PRODUCT.md).

```text
Console = control plane + surface de travail
Runtime  = exécution (Hermes-first)
Mission  = unité de travail traçable
Agent    = identité opérationnelle
Canal    = web d’abord (messaging / workspace = transports futurs)
```

## Interface actuelle

`apps/web` reprend la coque BoardUI pour en faire l’interface Hermes Console :

- sidebar, recherche, thèmes BoardUI ;
- aperçu, agents, missions, **artefacts (DB)**, paramètres ;
- conversation assistant-ui + SSE produit ;
- cancel / retry / awaiting_approval ;
- pièces jointes → volume partagé `runs/<id>/{in,out}` ;
- runtime (URL + token chiffré) + test `/health` + `/v1/capabilities`.

Créer un agent sur `/agents/new`, lancer sur `/runs/new`, suivre sur `/runs/thr_*`.

## Architecture exécutée

```text
┌──────────────────────────────────┐
│ apps/web — Vite + React 19   │
│ TanStack Router · BoardUI        │
│ navigateur ou fenêtre Tauri      │
└─────────┬────────────────────────┘
          │ HTTP JSON + SSE (+ multipart files)
          ▼
╔══════════════════════════════════════════╗
║ apps/server — Hono (Bun)                 ║
║ agents · runtime · threads · runner      ║
║ artifacts · cancel · approval · retry    ║
║ sert aussi le SPA compilé                ║
╚══════╤═══════════════╤══════════╤════════╝
       │ SQL           │ HTTP/SSE │ FS partagé
       ▼               ▼          ▼
┌────────────┐  ┌────────────┐  ┌─────────────────────────┐
│ PostgreSQL │  │ Hermes     │  │ HERMES_SHARED_WORKDIR   │
│ agents     │  │ :8642      │  │ runs/<id>/in|out        │
│ threads…   │  │ tools      │  │ (défaut /tmp/…-work)    │
│ artifacts  │  └────────────┘  └─────────────────────────┘
└────────────┘
```

Légende : la Console possède agents, historique, artefacts et politiques ; Hermes exécute ;
le volume partagé est le seul chemin fichiers (upload API Hermes rejeté).

## Configuration locale

Prérequis : le conteneur `infra-postgres` (`~/Documents/infra/compose.yml`) démarré sur `:5432` :

```bash
docker start infra-postgres
```

Puis, à la racine du repo :

```bash
make setup   # install + .env.local + création/vérification DB + migrations
```

Variables serveur :

- `DATABASE_URL` — Postgres dédié `infra-postgres`
  (`postgres://test:test@localhost:5432/hermes_console`) ;
- `HERMES_BASE_URL` / `HERMES_RUNTIME_TOKEN` — fallback **accès direct** si pas de config DB ;
  le mode tunnel SSH (Hermes sur une autre machine) se configure dans Paramètres → Runtime ;
- `HERMES_CLI_PATH` — chemin absolu optionnel vers la CLI Hermes pour un service background dont
  le `PATH` n'inclut pas `~/.local/bin` ;
- `INSTALLATION_ADMIN_EMAILS` — allowlist séparée des comptes autorisés à modifier le runtime et
  ses credentials ; si elle est absente, la compatibilité mono-admin ne s'active que lorsque
  `GOOGLE_ALLOWED_EMAILS` contient exactement une adresse ;
- `HERMES_PROTOCOL` — `agent` (défaut) ou `responses` ;
- `HERMES_SHARED_WORKDIR` — même chemin que l’hôte Hermes (défaut `/tmp/hermes-console-work`) ;
- `APP_ENCRYPTION_KEY` — chiffrement du token runtime.

## Runtime Hermes distant (tunnel SSH)

Hermes n'a pas besoin de tourner sur la machine de la Console. Dans **Paramètres → Runtime**,
mode « Tunnel SSH » : la Console monte un port-forward SSH côté serveur et joint Hermes à travers.
Le même canal sert au SFTP des pièces jointes et des artefacts. Rien n'est exposé sur le réseau.

Deux authentifications, à ne pas confondre :

| Couche | Ce qu'elle protège | Où la trouver |
|---|---|---|
| SSH | l'accès à la machine | clé/agent (`ssh-add -l`) via `~/.ssh/config`, ou mot de passe |
| Token Hermes | l'API du runtime | `API_SERVER_KEY` dans `~/.hermes/.env` sur la machine distante |

Côté machine distante :

- `AllowTcpForwarding yes` dans `sshd_config` — sinon le tunnel est refusé (message dédié dans l'UI) ;
- l'URL à saisir est celle vue **depuis cette machine**, en général `http://127.0.0.1:8642` ;
- « Dossier de travail distant » (défaut `/tmp/hermes-console-work`) reçoit `runs/<id>/{in,out}`.

Piège de diagnostic : `ssh <hôte> 'hermes --version'` peut échouer alors que le runtime tourne —
un SSH non interactif ne charge pas le `PATH` du shell de connexion. Vérifiez plutôt le service
(`systemctl --user status hermes-gateway`) ou le port (`ss -lntp | grep 8642`).

Le redémarrage d'Hermes depuis la Console reste réservé à un runtime local : en mode tunnel, le
`127.0.0.1` que voit la Console n'est pas la machine d'Hermes.

Pour sonder le contrat réellement consommé par la Console sans afficher le token :

```bash
HERMES_BASE_URL=http://127.0.0.1:8642 \
HERMES_RUNTIME_TOKEN='<secret>' \
bun run runtime:probe
```

Ajoutez `HERMES_TRANSPORT=ssh`, `HERMES_SSH_HOST` et `HERMES_SSH_USER` pour passer par le tunnel
strict du serveur. La commande appelle `/health` et `/v1/capabilities`, puis ferme explicitement le
ControlMaster avant de quitter.

## Démarrage

```bash
make dev
```

Parcours : `/agents/new` → `/runs/new` → `/runs/thr_*` → composer (± pièce jointe)
`POST /api/threads/:threadId/messages` + SSE `GET /api/threads/:threadId/events`.

## Documents

| Fichier | Contenu |
|---|---|
| [`PRODUCT.md`](PRODUCT.md) | Axe produit, anti-références, principes UX |
| [`docs/PRD.md`](docs/PRD.md) | PRD v0.7 — phases 0–4 + axe généraliste |
| [`docs/DESKTOP.md`](docs/DESKTOP.md) | Architecture : SPA Vite, serveur Hono, app Tauri |
| [`docs/INSTALLATION-UTILISATION.md`](docs/INSTALLATION-UTILISATION.md) | Installation et utilisation : Hermes local, Docker et VPS |
| [`docs/SPIKE-REPORT.md`](docs/SPIKE-REPORT.md) | Rapport Phase 0 : mesures runtime |
| `spike/` | Sonde v0 + faux LLM + fixtures |

> Le PRD et `docs/DESKTOP.md` décrivent l'architecture exécutée : SPA Vite/React,
> serveur Hono/Bun et client Tauri.

## Le spike en bref

Hermes v0.19.0 installé en natif. La bonne surface d’exécution est le **serveur API `:8642`**
(`API_SERVER_ENABLED=true`) ; le Dashboard `:9119` est la surface d’administration des skills,
de la configuration et des outils. Les deux processus restent supervisés séparément.

```text
POST /v1/runs            -> 202 { run_id, status }
GET  /v1/runs/{id}/events -> SSE
GET  /v1/runs/{id}        -> réconciliation
POST /v1/runs/{id}/stop   -> annulation
POST /v1/runs/{id}/approval
GET  /v1/capabilities
```

Conclusions structurantes : agents locaux (pas de profil Hermes) ; events ≠ doc officielle ;
fichiers = volume partagé uniquement.
