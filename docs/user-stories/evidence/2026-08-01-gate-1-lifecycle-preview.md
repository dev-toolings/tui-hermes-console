# Preuve — policy de cycle de vie et aperçu de purge non destructif

- Date/heure UTC : 2026-08-01
- Story : US-G1-006 (slice G1-006A)
- Environnement : tests locaux Bun + migration PostgreSQL préparée
- Commit : à renseigner après commit
- Reviewer : non effectué

## Périmètre livré

- policy site-wide versionnée, durée bornée `1..3650` jours et legal hold explicite ;
- contrôle de concurrence par `expectedVersion` ;
- aperçu de purge dry-run persisté, manifest canonique SHA-256 et snapshots des candidats ;
- candidats limités au site de session, aux threads dont tous les runs sont terminaux et dont la
  dernière activité (thread, messages, runs, événements, artefacts) est antérieure au cutoff ;
- refus `412 LIFECYCLE_POLICY_REQUIRED`, `409 LEGAL_HOLD_ACTIVE` et conflit de version ;
- audit de la policy et de l’aperçu dans la transaction ; un échec d’audit annule la mutation ;
- actions dédiées `data.lifecycle.read`, `data.lifecycle.manage`, `data.lifecycle.preview` ;
- ledger audit explicitement absent des plans et aucune suppression, `rm` ou mutation Hermes.

## API

- `GET /api/settings/data-lifecycle`
- `PUT /api/settings/data-lifecycle`
- `POST /api/settings/data-lifecycle/previews`
- `GET /api/settings/data-lifecycle/previews/:id`

## Vérifications locales

```text
bun run typecheck                         PASS
bun test .../retention/service.test.ts .../routes.test.ts .../site-authorization.test.ts PASS
bun test (386 tests, 0 échec)             PASS
bun run typecheck                         PASS
git diff --check                          PASS
```

Les tests PostgreSQL avec rôle runtime, l’exercice réel export/backup/restauration, la purge
conditionnée et la preuve P-OPS/P-SEC restent à faire. Ce rapport ne vaut pas acceptation de Gate 1.

## Verdict

IMPLÉMENTÉE — slice G1-006A uniquement ; US-G1-006 complète reste ouverte.
