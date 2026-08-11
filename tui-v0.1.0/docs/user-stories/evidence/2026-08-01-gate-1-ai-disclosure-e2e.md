# Preuve locale — US-G1-003 — P-E2E navigateur — 2026-08-01

## Fixture et commits

- Fixture : `bun run prepare:e2e:g1-003`, PostgreSQL scratch avec image
  `postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94`, SPA compilée
  servie par le même process.
- Commit du harness : `09c6112` — `test([user-story G1-003]): add isolated browser fixture`.
- Navigateur : Ghostchrome/Chromium local, session synthétique `g1-003` ; aucune identité Google réelle.
- Nettoyage : session Chrome purgée et fixture Docker arrêtée après le parcours.

## Parcours observé

1. Navigation directe `/runs/new` → redirection `/setup` avant la surface de mission.
2. Focus initial vérifié par DOM : `H2#ai-disclosure-title`, `tabIndex=-1`.
3. Arbre accessible vérifié : région `aria-labelledby="ai-disclosure-title"`, heading `h2`, résumé,
   liste de cinq risques, checkbox native et bouton désactivé.
4. Relation DOM vérifiée : `aria-describedby="ai-disclosure-summary ai-disclosure-items"`.
5. Clavier uniquement : Tab → `INPUT#ai-disclosure-consent`, Espace → `checked=true`, Tab → bouton
   « Accepter et ouvrir la Console », Entrée → navigation vers `/`.
6. Base scratch après acceptation : `2026-08-01.v2:true` pour l’utilisateur synthétique ; aucun thread
   créé (`0`).

## Limites

- Le lecteur d’écran Orca, NVDA ou VoiceOver n’a pas été exécuté ; la revue vocale reste ouverte.
- Ce parcours prouve une P-E2E locale, pas une acceptation Gate 1, Gate 0 ou une session Google réelle.
- Le scénario stale-version et les trois refus négatifs sont couverts par la preuve P-INT PostgreSQL
  [`2026-08-01-gate-1-ai-disclosure-local.md`](2026-08-01-gate-1-ai-disclosure-local.md).

Verdict : `IMPLÉMENTÉE — P-E2E navigateur partielle`; la story reste ouverte jusqu’à la revue lecteur
d’écran et au verdict indépendant.
