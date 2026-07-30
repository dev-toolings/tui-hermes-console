# Architecture — état réel

Hermes Console est une application Vite + React + TanStack Router servie par un
serveur Hono, empaquetée en application Tauri. Next a été retiré.

## Pourquoi Next est parti

Le desktop avait son propre SPA, réécrit à la main : une seconde
implémentation, plus pauvre, qui divergeait déjà de l'app web (elle comptait
3 conversations là où le web en comptait 2, faute d'un `?source=mission`).
Atteindre la parité imposait soit de partager le code entre deux frontends,
soit d'en supprimer un.

La mesure a tranché : **aucun** import `next/*` dans les 24 handlers d'API ni
dans un seul module métier ; seulement `next/link` (18 sites) et
`next/navigation` (11) dans les composants ; zéro server action ; 56 des
69 composants déjà `"use client"`. Next ne portait que 21 `page.tsx` fines et
4 layouts.

## L'architecture

```
┌── Tauri (Rust) ──────────────────────────────────────┐
│  WebView → apps/console  (Vite + React 19 + TanStack)│
│      │  fetch /api → 127.0.0.1:3170                  │
│      ▼                                                │
│  sidecar → apps/server  (Hono, binaire 65 Mo)        │
│   ├ drizzle → Postgres                                │
│   ├ ssh2 → tunnel SSH                                 │
│   ├ runner + SSE                                      │
│   ├ crypto AES-256-GCM                                │
│   └ sert aussi apps/console/dist  ← accès navigateur │
└───────────────────────────────────────────────────────┘

packages/console-core   logique pure partagée serveur ↔ UI :
                        types domaine, DTO d'API, run-status,
                        hermes-events, connectors, session
packages/ui             @boardui/ui — design system
```

`console-core` existe pour une raison précise : le SPA a besoin des types du
domaine, mais pas de `drizzle-orm`. `db/schema.ts` les ré-exporte, donc le code
serveur les importe toujours depuis le schéma.

Une réécriture Rust intégrale du backend, c'est plusieurs semaines et la perte
de tous les tests. Le sidecar laisse la porte ouverte à un passage progressif
(tunnel → `russh`, secrets → trousseau OS).

## Ce qui est mesuré et fonctionne

| Sujet | État | Preuve |
|---|---|---|
| API autonome | ✅ | 38 routes montées (`GET /__routes`) ; `/api/runtime` → `transport=ssh, sshHost=192.168.1.57, v0.19.0` |
| Les 21 écrans portés | ✅ | Aperçu, Missions, Agents, Artefacts, Support, Chat, Réglages (8 sous-écrans) rendus sans erreur console |
| Parité chiffrée avec l'ancien web | ✅ | Aperçu : Agents 2 · en cours 0 · Terminées 2 · Tokens (30 j) 1 840 486 — identique |
| Flux SSE | ✅ | transcript d'une mission Prospect rendu (12 718 caractères, appels d'outils inclus) |
| Redirections héritées | ✅ | `/chat/sessions` → `/chat` |
| Un seul port | ✅ | `:3170` sert le SPA en HTML et l'API en JSON ; `/api/inconnu` → 404, pas d'`index.html` |
| Build SPA | ✅ | 1,46 Mo JS (436 ko gzip), 138 ko CSS |
| Crate Tauri | ✅ | `cargo check` sans warning |
| Sidecar compilé | ✅ | binaire 65 Mo autonome, sans Node ni Bun |
| Configuration autonome | ✅ | lue dans `app_config_dir()/console.env`, plus dans un `.env` du dépôt |
| Tests | ✅ | 128 — 38 core, 78 serveur, 12 console |

Reproduire :

```bash
bun run dev                              # serveur (3170) + SPA (1420)
bun run build && bun run start           # un seul process, tout sur :3170
bun run --cwd apps/console sidecar:build # binaire autonome
cd apps/console/src-tauri && cargo check
bun run --cwd apps/console tauri:dev     # fenêtre native
```

## Configuration de l'application empaquetée

Une application installée n'a pas de dépôt à côté d'elle. Tauri lit donc :

```
~/Library/Application Support/tech.kweli.hermes-console/console.env   (macOS)
```

Le fichier est créé au premier lancement avec un gabarit commenté.
`DATABASE_URL` et `APP_ENCRYPTION_KEY` sont obligatoires ; si elles manquent,
l'app démarre quand même et le dit dans les logs, plutôt que de refuser de
s'ouvrir sans expliquer pourquoi.

## Ce qui reste à faire — honnêtement

1. **Trousseau OS.** Les secrets vivent en clair dans `console.env`. La cible
   est le trousseau système via un plugin Tauri.
2. **Postgres.** L'app suppose un Postgres joignable. Pour un vrai desktop, il
   faudra soit l'embarquer, soit basculer sur SQLite.
3. **Cibles non-macOS.** Le sidecar n'est compilé que pour
   `aarch64-apple-darwin`. Chaque plateforme visée demande sa propre passe.
4. **Découpage du bundle.** 1,46 Mo en un seul chunk : Vite le signale. Un
   `manualChunks` ou des imports dynamiques par route règlent ça.
5. **Lint.** 4 erreurs restantes, toutes antérieures à ce chantier :
   `connectors-settings` (2), `use-runtime-status`, `use-live-thread`.
