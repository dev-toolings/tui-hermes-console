# G1-006E — purge conditionnée locale

Cette slice ajoute la suppression réelle du périmètre Console décrit par un aperçu de rétention.
Elle ne supprime jamais le ledger d’audit et n’appelle pas Hermes.

## Contrat

- `POST /api/settings/data-lifecycle/purges` accepte uniquement `{ previewId }` ; le site vient de
  la session et `data.lifecycle.purge` est réservé à `admin`.
- Le preview est verrouillé en PostgreSQL et devient single-use avec `purged_at`.
- La policy courante est reverrouillée : version, durée et `legal_hold_enabled` doivent rester
  compatibles avec le preview.
- Le manifeste et les compteurs/hashes des candidats sont recalculés avant tout effet ; une mission
  non terminale, une dérive ou une portée croisée bloque la purge.
- Un audit d’intention est écrit avant toute quarantaine filesystem ; l’outcome est écrit dans la
  même transaction que la suppression des rows. Une panne d’audit ne mute rien.
- Les chemins filesystem sont dérivés des `runId` validés sous les deux racines Console ; la colonne
  `storage_path` n’est jamais utilisée comme chemin destructif libre.
- Les dossiers sont déplacés vers une quarantaine puis nettoyés après commit. `cleanup_pending` est
  conservé si le nettoyage post-commit échoue.

## Preuve locale

```sh
bun run proof:g1-006e
bun test apps/server/src/api/settings/data-lifecycle/purges/route.test.ts
```

La fixture PostgreSQL + filesystem couvre : succès inter-site borné, double purge, legal hold
activé après preview, appel cross-site, audit indisponible et symlink hostile.

## Limites

Cette preuve reste locale : elle ne vaut pas backup externe, P-OPS, restauration d’installation
complète, rollback opérateur ou acceptation Gate 1. Elle autorise une purge depuis un preview vérifié
sans exiger un export métier préalable ; le backup externe reste une exigence séparée.
