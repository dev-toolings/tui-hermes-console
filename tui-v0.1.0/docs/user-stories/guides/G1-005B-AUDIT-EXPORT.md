# Guide de recette — G1-005B-local, export d’audit HTTP/PostgreSQL

Ce sous-slice vérifie l’export d’audit sur PostgreSQL réel et la route Hono montée. Il ne constitue
pas une revue P-SEC indépendante, ne remplace pas la dépendance G1-004 et ne ferme pas Gate 1.

## Architecture

╔══════════════════════╗      HTTP + CSRF      ╔══════════════════════╗
║ session auditor/site ║ ────────────────────▶ ║ POST /api/audit/exports║
╚══════════════════════╝                       ╚══════════╤═══════════╝
                                                         │ site-scoped + HMAC
                                                         ▼
                                                  ┌──────────────────┐
                                                  │ PostgreSQL ledger │
                                                  └────────┬─────────┘
                                                           │ NDJSON + trailer
                                                           ▼
                                                  ┌──────────────────┐
                                                  │ export expurgé    │
                                                  └──────────────────┘

Légende : la session fournit le site ; le service vérifie la continuité et l’HMAC avant d’ajouter
l’événement de succès ; le corps n’est renvoyé qu’après cet append.

## Exécution

    bun run proof:g1-005b

Le test démarre une base PostgreSQL scratch avec l’image digestée du dépôt, applique toutes les
migrations et monte l’application Hono réelle en mémoire. Deux sites, deux auditeurs et un requester sont créés
avec des sessions et des organisations séparées.

## Critères vérifiés

- l’auditeur du site A reçoit uniquement les séquences du site A ;
- l’auditeur du site B ne reçoit pas les entrées du site A ;
- le header SHA-256 correspond aux lignes NDJSON avant le trailer ;
- le trailer contient plage, compteur et identifiant de l’événement d’export ;
- l’événement AUDIT_EXPORT_COMPLETED est ajouté au ledger du site courant ;
- requester, CSRF forgé et champ siteId injecté sont refusés sans corps NDJSON ;
- une entrée HMAC altérée répond 409 sans header d’export ;
- un append de succès indisponible produit une erreur fail-closed sans résultat.

## Limites

La preuve est P-INT locale sur PostgreSQL scratch. Elle ne prouve pas la revue indépendante
d’immutabilité, P-SEC/P-E2E de production, la dépendance G1-004 ni l’acceptation de Gate 1.
