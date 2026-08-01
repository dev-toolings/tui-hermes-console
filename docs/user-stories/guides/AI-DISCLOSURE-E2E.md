# G1-003 — recette P-INT / P-E2E de la notice IA

Cette recette distingue la preuve PostgreSQL/API (P-INT) de la preuve navigateur et lecteur d'écran
(P-E2E). Une exécution locale ne vaut pas acceptation Gate 1 sans revue indépendante.

```text
╔══════════════════╗
║ Navigateur réel  ║
╚════════╤═════════╝
         │ cookie synthétique · navigation clavier
         ▼
┌──────────────────┐   HTTP 423/428 + POST consent   ┌──────────────────┐
│ Console SPA/API  │────────────────────────────────▶│ PostgreSQL scratch│
└────────╤─────────┘                                 └──────────────────┘
         │ refus avant effet
         ▼
┌──────────────────┐
│ Runtime témoin   │  compteur attendu : 0 avant consentement
└──────────────────┘
```

Légende : le navigateur passe par la SPA/API ; PostgreSQL conserve la version et l’horodatage ; le
runtime témoin ne doit recevoir aucun appel lors d’un refus.

## Préparation

- Utiliser uniquement un requester synthétique et des données fictives.
- Démarrer PostgreSQL scratch avec l’image déjà pinnée du dépôt et un projet Docker temporaire.
- Terminer le setup, créer deux utilisateurs et laisser leur consentement IA absent.
- Ne pas démarrer Hermes réel pour le test de refus ; remplacer l’appel runtime par un compteur témoin.
- Ne jamais utiliser cookie, token, email ou donnée client de production.

## P-INT — API et base

1. `GET /api/auth` doit signaler `consentRequired: true`.
2. `GET /api/setup` doit exposer la notice `2026-08-01.v2` sans horodatage accepté.
3. Avec le requester sans consentement, vérifier `428 AI_DISCLOSURE_CONSENT_REQUIRED` sur :
   - `POST /api/threads` ;
   - `POST /api/threads/:threadId/messages` ;
   - `POST /api/runs/:runId/retry`.
4. Après chaque refus, comparer les comptes threads/runs/messages/artifacts et le compteur runtime.
5. Poster une ancienne version : `409 AI_DISCLOSURE_VERSION_OUTDATED`, sans mutation.
6. Poster `2026-08-01.v2` : `200`, version et `accepted_at` persistés ; comparer le timestamp de la
   réponse à PostgreSQL.
7. Vérifier que le second utilisateur reste `consentRequired: true`.
8. Répéter avec une version rendue obsolète et vérifier le retour immédiat à `428`.

Un test Docker non exécuté doit être rapporté `P-INT NON EXÉCUTÉ`, jamais comme une preuve verte.

## P-E2E — navigateur, clavier et arbre accessible

Sur la SPA compilée, ouvrir directement `/runs/new` avec le requester sans consentement :

1. Vérifier la redirection vers `/setup` avant le rendu de la surface de mission.
2. Inspecter l’arbre accessible : région nommée, heading `h2`, résumé, liste des risques, checkbox
   native nommée et bouton désactivé.
3. Au clavier uniquement : Tab atteint la checkbox, Espace la coche, Tab atteint le bouton, Entrée
   accepte.
4. Vérifier le retour vers la Console, recharger et confirmer la conservation du consentement.
5. Rendre le consentement obsolète, recharger `/runs/new` et vérifier une nouvelle redirection/setup.
6. Répéter la lecture avec Orca, VoiceOver ou NVDA et consigner exactement ce qui est annoncé : titre,
   résumé, risques, nom de checkbox et état coché/non coché.

## Rapport

Consigner la date UTC, le commit, l’image PostgreSQL et son digest, la version et le SHA-256 de la
notice, les statuts HTTP, les inventaires DB avant/après, le compteur runtime, l’ordre clavier, la
sortie de l’arbre accessible et le lecteur d’écran utilisé. Expurger tout secret et toute donnée
personnelle.

Sans navigateur réel, la story reste `IMPLÉMENTÉE — P-CODE/P-INT`. Sans lecteur d’écran, elle reste
`IMPLÉMENTÉE — P-E2E partielle`. Seul un rapport complet revu peut passer à `VÉRIFIÉE`.
