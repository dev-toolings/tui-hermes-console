# Preuve — Export d’audit expurgé

- **Date :** 01-08-2026
- **Story :** US-G1-005
- **Commit :** `c281deb` (`feat([user-story G1-005]): add redacted audit export`)
- **Environnement :** tests Bun locaux, sans données client
- **Verdict :** `BLOQUÉE` pour l’acceptation Gate 1 ; préparation code vérifiée localement

## Contrat livré

`POST /api/audit/exports` accepte uniquement une plage `fromSequence`/`toSequence`, sans `siteId`
client. La portée est dérivée de la session et l’action `audit.export` est réservée aux rôles
`admin` et `auditor`.

Avant toute réponse, le serveur vérifie la continuité de la plage, la liaison `previousHash` et le
HMAC de chaque entrée. L’export NDJSON applique une allowlist : les identifiants utilisateur,
organisations, mandats et états bruts sont omis ; les identifiants de ressource/corrélation sont
pseudonymisés. Un trailer porte la version, la plage, l’identifiant d’export et le SHA-256 du flux.
L’export réussi est lui-même ajouté au ledger ; si cette écriture échoue, aucun corps n’est retourné.

## Validation locale

```text
bun test apps/server/src/modules/audit/export.test.ts apps/server/src/routes.test.ts --max-concurrency=1
8 pass · 0 fail · 104 expect()
bun run typecheck
server typecheck · console typecheck · core typecheck : OK
```

## Limites

Cette preuve ne couvre pas encore la revue P-SEC/P-E2E multi-site, la restauration d’une base réelle,
la rétention, le backup, ni l’acceptation indépendante. G1-004 reste bloquée : l’export ne crée pas
une policy pré-action et ne transforme pas l’approbation Hermes en frontière de sécurité.
