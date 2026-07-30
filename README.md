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
┌────────────────────┐
│ BoardUI + assistant│
│ UI dans le browser │
└─────────┬──────────┘
          │ HTTP JSON + SSE (+ multipart files)
          ▼
╔══════════════════════════════════════════╗
║ Next.js Console                          ║
║ agents · runtime · threads · runner      ║
║ artifacts · cancel · approval · retry    ║
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

```bash
cp apps/web/.env.example apps/web/.env.local
# DATABASE_URL, HERMES_*, APP_ENCRYPTION_KEY, HERMES_SHARED_WORKDIR
bun run db:migrate
```

Variables serveur :

- `DATABASE_URL` — Postgres dédié (`infra-postgres`) ;
- `HERMES_BASE_URL` / `HERMES_RUNTIME_TOKEN` — fallback si pas de config DB ;
- `HERMES_PROTOCOL` — `agent` (défaut) ou `responses` ;
- `HERMES_SHARED_WORKDIR` — même chemin que l’hôte Hermes (défaut `/tmp/hermes-console-work`) ;
- `APP_ENCRYPTION_KEY` — chiffrement du token runtime.

Puis :

```bash
bun run db:seed   # agent miroir depuis /health + /v1/models
bun run dev
```

Parcours : `/agents/new` → `/runs/new` → `/runs/thr_*` → composer (± pièce jointe)
`POST /api/threads/:threadId/messages` + SSE `GET /api/threads/:threadId/events`.

## Documents

| Fichier | Contenu |
|---|---|
| [`PRODUCT.md`](PRODUCT.md) | Axe produit, anti-références, principes UX |
| [`docs/PRD.md`](docs/PRD.md) | PRD v0.7 — phases 0–4 + axe généraliste |
| [`docs/SPIKE-REPORT.md`](docs/SPIKE-REPORT.md) | Rapport Phase 0 : mesures runtime |
| `spike/` | Sonde v0 + faux LLM + fixtures |

## Le spike en bref

Hermes v0.19.0 installé en natif. La bonne surface est le **serveur API `:8642`**
(`API_SERVER_ENABLED=true`), pas le dashboard `:9119`.

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
