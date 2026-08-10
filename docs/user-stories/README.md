# User stories normatives — Hermes Console

**Version :** 1.3

**Date :** 09-08-2026

**Source :** [`../PRD.md`](../PRD.md) v1.6

**Périmètre :** Gates 0 à 2

Ce dossier transforme le PRD en contrats produit vérifiables. Il ne déclare aucune capacité comme
livrée : une story n'est respectée que lorsque son état est `ACCEPTÉE` et que ses preuves sont
consultables. En cas de contradiction, le PRD fixe la direction produit et ce dossier fixe le
contrat d'acceptation de la livraison.

~~~text
╔══════════════════╗
║ PRD v1.6         ║
║ vérité produit   ║
╚════════╤═════════╝
         │ exigences · Gates 0–2
         ▼
╔══════════════════╗
║ User stories     ║
║ scénarios G/W/T  ║
╚════════╤═════════╝
         │ preuves exigées · résultats de tests
         ▼
┌──────────────────┐
│ Rapport daté     │
│ décision de gate │
└──────────────────┘
~~~

Légende : G/W/T signifie Given/When/Then ; chaque flèche porte le livrable transmis à l'étape
suivante. Composants : PRD, contrats d'acceptation, rapport de preuve.

## Ordre de lecture

1. [`CONVENTIONS.md`](CONVENTIONS.md) — vocabulaire normatif, états et qualité des preuves ;
2. [`TRACEABILITY.md`](TRACEABILITY.md) — lien entre PRD, stories et décision de gate ;
3. [`TASKS-ET-INBOX.md`](TASKS-ET-INBOX.md) — frontière capture/contrat/plan/exécution/preuve/décision et référence Multica bornée ;
4. [`GATE-0-VALIDATION-COMMERCIALE.md`](GATE-0-VALIDATION-COMMERCIALE.md) ;
5. [`GATE-1-CONTRAT-EXPLOITATION.md`](GATE-1-CONTRAT-EXPLOITATION.md) ;
6. [`SSH-STORIES.md`](SSH-STORIES.md) — décomposition normative de l'epic SSH ;
7. [`GATE-2-EQUIPE-CLIENT.md`](GATE-2-EQUIPE-CLIENT.md) ;
8. [`guides/SSH-VPS-VIERGE.md`](guides/SSH-VPS-VIERGE.md) — bootstrap et preuve SSH réelle ;
9. [`evidence/README.md`](evidence/README.md) — format des rapports de preuve.

## Règles de gouvernance

- Les Gates sont séquentielles. Une Gate ne passe que si toutes ses stories obligatoires sont
  `ACCEPTÉES` ou si une dérogation datée, bornée et approuvée est jointe au rapport.
- Une story explicitement marquée « optionnelle, non bloquante pour Gate 0 » ne bloque pas la décision de Gate. Elle
  reste toutefois non livrée tant que ses scénarios, preuves et reviewers ne sont pas satisfaits.
- La persistance des artefacts, le confinement OS, le refus fail-closed, la confiance de clé d'hôte,
  l'absence de fallback d'authentification, le chemin admin/recovery et la révocation effective ne
  sont pas dérogeables. Une Gate qui manque l'un de ces contrôles reste `BLOQUÉE`.
- Un test unitaire vert ne remplace pas un test E2E lorsqu'une story exige un système réel.
- L'Inbox est une projection d'objets source ; elle ne devient personnelle qu'après attribution
  explicite et prouvée côté serveur. Avant cela, son wording est partagé par rôle/capacité, un
  brouillon reste une action de cadrage distincte du suivi en cours, jamais un run Hermes.
- La matrice de traçabilité normalise 35 identifiants normatifs uniques ; sa ligne SSH agrégée
  représente six stories détaillées dans `SSH-STORIES.md`.
- Une capture seule ne prouve ni l'autorisation ni la persistance. Les preuves combinent résultat,
  identifiants corrélables, environnement et test négatif.
- Aucun mot de passe, token, clé privée, cookie, prompt client, adresse privée ou contenu métier ne
  doit entrer dans Git. Les rapports utilisent des valeurs expurgées et des empreintes.
- Une IP de test éphémère peut apparaître uniquement dans un rapport de preuve daté et expurgé,
  jamais dans une configuration, une story ou ce guide.
- Le runtime Hermes reste externe au Compose actuel tant qu'une story ne démontre pas une autre
  topologie. La Console gouverne ; Hermes exécute.
- Le périmètre de ce dossier s'arrête à la Gate 2. L'ancienne Gate 3 (Edge/Relay et fleet) a été supprimée
  le 08-08-2026, voir la section « Périmètre supprimé » de [`TRACEABILITY.md`](TRACEABILITY.md).

## Définition globale de « terminé »

Une story est terminée lorsque :

- tous ses scénarios obligatoires positifs et négatifs passent ;
- ses dépendances sont `ACCEPTÉES` ;
- les preuves attendues existent dans un rapport daté ;
- les erreurs sont fail-closed pour l'autorisation et explicites pour l'opérateur ;
- les secrets et données sensibles ont été expurgés ;
- le reviewer indiqué dans la story a accepté le rapport ;
- la matrice de traçabilité référence la preuve et son verdict.
