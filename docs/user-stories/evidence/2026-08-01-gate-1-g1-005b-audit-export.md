# Preuve locale — US-G1-005B — export d’audit Hono/PostgreSQL

- Date : 01-08-2026
- Story : US-G1-005B-local, sous-slice de US-G1-005
- Environnement : PostgreSQL scratch Docker + application Hono montée en mémoire
- Commande : bun run proof:g1-005b
- Résultat : 3 tests pass, 0 échec, 46 assertions

## Scénario positif

Deux sites indépendants sont initialisés avec un auditeur par site. L’auditeur du site A exporte
les séquences 1 à 2 ; le corps contient uniquement les entrées du site A. L’auditeur du site B
exporte sa séquence 1 ; aucune entrée du site A n’est renvoyée.

Le header x-audit-export-sha256 est vérifié contre les lignes NDJSON avant le trailer. Le trailer
reprend la plage, le compteur, le hash et l’identifiant d’événement. Chaque succès ajoute
AUDIT_EXPORT_COMPLETED au ledger du site courant.

## Scénarios négatifs

- requester sans audit.export : 403, pas de corps NDJSON ;
- token CSRF forgé : 403, pas de corps NDJSON ;
- champ siteId injecté : 400, le site ne vient jamais du corps ;
- entry_hash altéré sur le ledger B : 409, aucun header d’export ;
- append de l’événement de succès indisponible après lecture valide : HTTP 503, corps vide,
  cache-control no-store, aucun header d’export et aucun nouvel événement de succès.

## Verdict

G1-005B-local est vérifiée pour P-INT et la route Hono locale. US-G1-005 reste
IMPLÉMENTÉE localement mais non clôturée : revue indépendante, P-SEC/P-E2E, dépendance G1-004 et
acceptation Gate 1 restent ouvertes.

G2-005 et G2-006 n’ont pas été modifiées.
