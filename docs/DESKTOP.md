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
| Tests | ✅ | 158 — 38 core, 80 serveur, 40 console |

Reproduire :

```bash
bun run dev                              # serveur (3170) + SPA (1420)
bun run build && bun run start           # un seul process, tout sur :3170
bun run --cwd apps/console sidecar:build # binaire autonome
cd apps/console/src-tauri && cargo check
bun run --cwd apps/console tauri:dev     # fenêtre native
```

## Fluidité — ce qui a été mesuré

Mesures prises sur la conversation Prospect (`thr_317dae91…` : 4 messages,
270 Ko de contenu, 97 événements dont 45 appels d'outils), build de production
servi sur `:3170`, Apple Silicon, sans throttling.

| Mesure | Avant | Après |
|---|---|---|
| Ouverture de la fenêtre Tauri | après le sidecar (voir plus bas) | immédiate, sans l'attendre |
| Identités de message recréées par événement SSE | **100 %** | 33 % — le seul message qui streame |
| Coût cumulé de `buildThreadMessagesFromSnapshot` sur un run | 5,3 ms | 0,08 ms |
| Trafic du filet de rattrapage pendant un run | 563 Ko × 2/s, **en parallèle du SSE** | suspendu tant que le SSE est attaché |
| LCP du SPA | 332 ms | 369 ms (bruit — le garde `/api/healthz` coûte 1 ms) |
| Longues tâches (> 50 ms) au chargement | 0 | 0 |
| JS chargé sur une route sans graphique ni conversation (`/agents`) | 1,62 Mo — **484 ko gzip** | 610 ko — **185 ko gzip** |

**Combien de temps la fenêtre attendait-elle ?** Ça dépend entièrement du cache
disque, et l'écart est de 30× : 1072 ms puis 712 ms sur un binaire froid,
31–96 ms (médiane 81 ms sur 5 tirs) une fois le binaire de 65 Mo en cache,
176 ms pour l'app empaquetée. Autrement dit : négligeable à la relance,
proche de la seconde à la première ouverture après un démarrage machine ou une
installation — précisément le moment où l'application est jugée. Un binaire
Bun de 65 Mo, une connexion Postgres et un tunnel SSH n'ont de toute façon rien
à faire sur le chemin critique de l'affichage d'une fenêtre.

Trois enseignements qui ont réordonné le chantier :

1. **Le sidecar était le seul écart perceptible, et il était côté Rust.** Pas
   dans le SPA, qui se charge entièrement en ~330 ms sans une seule longue tâche.
2. **Le bundle n'était pas un problème de fluidité.** 1,6 Mo, mais téléchargés
   en 5 ms depuis le disque local et sans produire une seule longue tâche. Il a
   quand même été découpé (voir plus bas) : le gain est en mémoire et en parsing,
   pas en millisecondes perceptibles sur cette machine.
3. **Le coût du streaming n'était pas dans le JS mais dans les identités.**
   Reconstruire le fil coûtait 0,33 ms — négligeable ; mais 100 % des objets
   `ThreadMessageLike` changeaient d'identité à chaque événement, ce qui faisait
   re-rendre tout le fil et reparser tout son markdown. Un `React.memo` sur les
   composants de message n'y aurait rien changé : ils n'ont pas de props, ils
   lisent le store d'assistant-ui par sélecteurs.

Les événements SSE sont des événements *produit* (`tool.call`, `tool.result`,
`agent.message`) et non des deltas par jeton : 16 pour le run rejoué. Il n'y a
donc pas de rafale à amortir, et rien à coaliser sur une frame.

**Ce que le garde de démarrage donne, vérifié bout en bout** — SPA servi, API
volontairement morte : la coque complète s'affiche (rail, navigation, en-tête)
et le contenu montre « Chargement… ». Aucune erreur, aucun HTTP 500 à l'écran.
Dès que le serveur répond, l'écran se remplit seul, sans rechargement. Les
sondes `/api/healthz` échouées apparaissent en console pendant l'attente : c'est
le prix du filet, et il ne dure que le démarrage.

**Le découpage du bundle, et le piège qu'il cache.** Les écrans lourds passent
par `import()` — conversations (`route-tree.tsx`), graphique et table de
l'Aperçu (`screens/dashboard.tsx`) — avec une seule frontière `Suspense`, dans
la coque Console. Rollup en déduit seul les chunks : l'entrée tombe à 185 ko
gzip et `/agents` ne charge plus ni `recharts`, ni `assistant-ui`, ni
`react-table`. Ajouter un `manualChunks` par-dessus fait l'inverse : les chunks
nommés remontent en `modulepreload` dans `index.html` et redeviennent eager sur
toutes les routes. Le contrôle tient en une ligne : `dist/index.html` ne doit
contenir aucun `rel="modulepreload"`.

**Non mesuré.** Le délai d'apparition de la fenêtre elle-même : `osascript` n'a
pas l'autorisation d'accessibilité (-25211) et `screencapture` est refusé dans
cet environnement. Ce qui *est* établi, c'est que la fenêtre n'attend plus le
sidecar — le SPA sonde `/api/healthz` alors que l'API est encore absente, ce
qu'il ne pourrait pas faire si sa webview n'existait pas déjà.

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
4. **Virtualisation du fil.** Aucune aujourd'hui. Pas nécessaire sur les
   conversations actuelles ; à reprendre si un fil long fait décrocher le scroll,
   en tenant compte du viewport qu'assistant-ui gère déjà lui-même.
5. **Lint.** 4 erreurs restantes, toutes antérieures à ce chantier :
   `connectors-settings` (2), `use-runtime-status`, `use-live-thread`.
