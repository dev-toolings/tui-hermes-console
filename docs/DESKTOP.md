# Transition desktop — état réel

Branche `feat/desktop`. Objectif : Hermes Console en application Tauri, **sans
jeter les trois phases déjà validées** (runner SSE, tunnel SSH `ssh2`,
chiffrement AES-256-GCM, réconciliation).

## Le choix : sidecar Node, pas réécriture Rust

```
┌── Tauri (Rust) ────────────────────────────────┐
│  WebView → apps/desktop  (Vite + React 19)     │
│      │  fetch /api → 127.0.0.1:3170            │
│      ▼                                          │
│  sidecar → apps/server  (Hono, binaire 65 Mo)  │
│   ├ drizzle → Postgres        (réutilisé)      │
│   ├ ssh2 → tunnel SSH         (réutilisé)      │
│   ├ runner + SSE              (réutilisé)      │
│   └ crypto AES-256-GCM        (réutilisé)      │
└─────────────────────────────────────────────────┘
```

Une réécriture Rust intégrale du backend, c'est plusieurs semaines et la perte
de tous les tests existants. Ce n'est pas une transition, c'est un redémarrage.
Le sidecar laisse la porte ouverte à un passage progressif vers Rust, morceau
par morceau (tunnel → `russh`, secrets → keychain OS).

## Ce qui est mesuré et fonctionne

| Étape | État | Preuve |
|---|---|---|
| 6a — serveur autonome | ✅ | 34 routes montées, `GET /__routes` ; `/api/runtime` renvoie `transport=ssh, sshHost=192.168.1.57, v0.19.0` |
| 6a — zéro duplication | ✅ | les 24 `route.ts` n'importent **aucun** `next/*` et n'utilisent que `Request`/`Response` — Hono les monte tels quels |
| 6b — SPA Vite | ✅ | build 286 ko JS / 135 ko CSS ; proxy `/api` → serveur ; Aperçu affiche les vraies données |
| 6b — design system | ✅ | `@boardui/ui` et ses tokens réutilisés sans modification |
| 6c — crate Tauri | ✅ | `cargo check` passe, zéro warning |
| 6c — sidecar compilé | ✅ | binaire 65 Mo autonome : `/api/runtime` → `configured=true, transport=ssh` **sans Node ni Bun installés** |

Reproduire :

```bash
bun run --cwd apps/server start          # serveur seul, port 3170
bun run --cwd apps/desktop dev           # SPA sur 1420, proxy vers 3170
bun run --cwd apps/desktop sidecar:build # binaire autonome
cd apps/desktop/src-tauri && cargo check
```

## Ce qui reste à faire — honnêtement

1. **Porter les écrans.** Seul l'Aperçu est porté. Missions, Chat, Agents,
   Artefacts, Paramètres affichent un écran « pas encore porté ». Le travail est
   mécanique (les `page.tsx` server components deviennent des routes avec
   `loader`) mais il reste entier — c'est le gros du chantier.
2. **Le flux SSE.** `/api/threads/:id/events` est monté et répond, mais le SPA
   ne le consomme pas encore : `use-live-thread` dépend encore de Next.
3. **La configuration.** Le binaire compilé ne lit pas `apps/web/.env.local` :
   il faut lui passer `DATABASE_URL` et `APP_ENCRYPTION_KEY` par
   l'environnement. Une app desktop ne peut pas dépendre d'un `.env` de dépôt —
   c'est le premier morceau à basculer côté Rust (keychain OS).
4. **Postgres.** L'app suppose un Postgres joignable. Pour un vrai desktop, il
   faudra soit l'embarquer, soit basculer sur SQLite.
5. **Cibles non-macOS.** Le sidecar n'est compilé que pour
   `aarch64-apple-darwin`. Chaque plateforme visée demande sa propre passe.

`cargo tauri dev` n'a pas été lancé : il ouvre une fenêtre native, à faire en
session interactive.
