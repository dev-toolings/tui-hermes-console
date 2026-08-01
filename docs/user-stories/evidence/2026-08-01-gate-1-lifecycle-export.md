# Preuve — export métier vérifié G1-006B

- Date/heure UTC : 2026-08-01
- Story : US-G1-006 (slice G1-006B)
- Commit : à renseigner après commit
- Environnement : tests locaux Bun ; PostgreSQL de test disponible pour la suite existante
- Reviewer : non effectué

## Périmètre livré

- `POST /api/settings/data-lifecycle/exports` accepte uniquement `{ previewId }` ; aucun `siteId`
  n’est accepté dans le payload.
- Le preview et toutes les ressources sont résolus depuis le site de session.
- Threads, runs, messages, événements et métadonnées d’artefacts sont exportés dans un JSON lisible.
- Chaque artefact est relu avec contrôle de fichier régulier, taille et SHA-256 ; ses octets sont
  inclus en base64.
- Les IDs, compteurs, preview/policy et hash du bundle sont conservés pour la corrélation métier.
- Le snapshot du preview est comparé à l’état courant ; une modification ou une source manquante
  refuse l’export.
- L’export est borné à 100 MiB d’octets bruts et audité dans la transaction avant réponse.
- Aucun `DELETE`, `rm`, backup externe, restauration ou appel Hermes n’est ajouté.

## Vérifications locales

```text
bun test .../retention .../routes.test.ts .../site-authorization.test.ts PASS
bun test (388 tests, 0 échec)                                    PASS
bun run typecheck                                                       PASS
git diff --check                                                        PASS
```

La preuve P-OPS du backup externe, de la restauration scratch, du rollback et de la purge réelle
reste à produire. Ce rapport ne vaut pas acceptation Gate 1.

## Verdict

IMPLÉMENTÉE — slice G1-006B uniquement ; US-G1-006 complète reste ouverte.
