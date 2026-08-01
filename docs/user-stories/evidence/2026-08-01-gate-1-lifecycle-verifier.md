# Preuve — vérificateur local de bundle G1-006C

- Date/heure UTC : 2026-08-01
- Story : US-G1-006 (préparation G1-006C)
- Commits : `295b206`, `369fbbc`
- Environnement : Bun local
- Reviewer : non effectué

Le vérificateur `apps/server/scripts/verify-lifecycle-export.ts` contrôle sans écriture :

- JSON/version/type du bundle ;
- `siteId`, manifeste canonique et digest du manifeste ;
- unicité des IDs et relations threads → runs → messages/événements/artefacts, sans orphelin ni
  mélange de sites ;
- SHA-256 global fourni hors bande ;
- unicité des artefacts ;
- décodage base64, taille déclarée et SHA-256 de chaque octet.

Tests locaux : `bun test apps/server/src/modules/retention/export.test.ts apps/server/src/modules/retention/verify-export.test.ts`
— PASS ; le backup externe et la restauration scratch restent non exécutés.

Ce n’est pas encore une preuve de backup externe ni de restauration scratch. Aucun statut de story
complète n’est changé.

## Verdict

PRÉPARATION — G1-006C reste ouverte.
