# Preuve locale — US-G1-SSH-006A — 2026-08-01

## Périmètre

Ce slice borne lexicalement les chemins envoyés par la synchronisation SFTP de la Console au workdir
absolu configuré. Il protège contre les chemins relatifs, NUL, segments `.`/`..`, traversées, racines
système et préfixes de sibling. Il ne constitue pas une frontière OS, ne neutralise pas les symlinks
ou les races distantes et ne vaut pas preuve VPS/P-OPS.

## Code et validation

- Commit : `852cad0` — `feat([user-story G1-SSH-006A]): bound remote SFTP paths`
- `createScopedSftp` applique la garde à `mkdirp`, `list`, `stat`, `upload` et `download`.
- `remote-sync` refuse un workdir `/` avant tout appel SFTP et conserve l'identifiant de run dans
  l'erreur `open_sftp`.
- Tests ciblés :

  ```text
  bun test apps/server/src/modules/runtime/ssh/*.test.ts \
    apps/server/src/modules/artifacts/remote-sync.test.ts
  70 pass, 0 fail, 129 expect calls
  ```

- Typecheck serveur : `bun run --filter server typecheck` — PASS.
- `git diff --check` — PASS.

## Limites explicites

- Aucun VPS vierge ni Hermes réel n'a été utilisé.
- Le transport `system-ssh` conserve un canal shell distant ; une frontière OS exige un helper/sidecar
  ou une politique SFTP serveur dédiée.
- La story complète US-G1-SSH-006 reste donc bloquée jusqu'aux preuves P-E2E/P-OPS/P-SEC.

Verdict du slice : `IMPLÉMENTÉE LOCALE` — l'acceptation de l'epic SSH reste ouverte.
