# Preuve locale — US-G1-003 — 2026-08-01

## Périmètre

Cette preuve couvre le slice local de la notice IA versionnée `2026-08-01.v2` et de son garde de
consentement. Elle ne ferme pas la preuve P-E2E navigateur ni la revue par lecteur d'écran.

## Code et validation

- Commits : `e471e0e` — `feat([user-story G1-003]): harden AI disclosure accessibility` ;
  `bf5c4a2` — `refactor([user-story G1-003]): derive consent guard from route manifest`
- Rendu SSR contrôlé par `apps/console/src/screens/setup.a11y.test.tsx` : région nommée, titre
  `h2`, résumé et liste identifiés, checkbox reliée par `label[for]` et `aria-describedby`.
- Tests ciblés :

  ```text
  bun test apps/console/src/screens/setup.a11y.test.tsx \
    apps/server/src/modules/setup/ai-disclosure.test.ts \
    apps/server/src/modules/setup/ai-disclosure-routes.test.ts
  12 pass, 0 fail, 38 expect calls
  ```

- Typecheck Console : `bun run --filter console typecheck` — PASS.
- Le middleware serveur dérive désormais les trois méthodes protégées du manifeste `ROUTES` ; aucun
  second inventaire regex indépendant ne décide du refus `428`.

## Limites explicites

- Aucun navigateur réel n'a été exécuté pour ce slice ; la navigation Tab/Espace/Entrée reste à
  prouver sur `/runs/new` → `/setup`.
- Aucun arbre d'accessibilité généré par navigateur ni lecteur d'écran (NVDA, Orca ou VoiceOver) n'a
  été utilisé.
- Les gardes serveur `423/428` sont couverts par les tests API ciblés, pas par une session Google réelle.

Le statut reste donc `IMPLÉMENTÉE` localement, avec P-E2E et acceptation Gate 1 ouvertes.
