# Preuve — Séparation MSP/client et mandats

- Date/heure UTC : 2026-08-01
- Story : US-G2-004
- Commit/build : branche `feat/us-g2-004-msp-client`, commit `7d122cc`
- Environnement : local, PostgreSQL Docker éphémère `postgres:17.6-alpine` épinglé par digest
- Opérateur : équipe Console
- Reviewer : Vador — contre-audit à rattacher
- Versions : Console workspace courant ; Bun ; PostgreSQL 17.6 Alpine

## Préconditions

- US-G2-001 à US-G2-003 sont présentes sur la branche dérivée de `main`.
- Les migrations 0022 et 0023 ajoutent organisations client/MSP, affiliations, mandats site/projet,
  affectations individuelles, enveloppe d’audit v2 et snapshot d’autorisation sur les runs.
- Un site possède exactement une organisation cliente. Un operator doit avoir une affiliation MSP,
  une membership `operator`, un mandat actif et une affectation individuelle.
- Les mandats ne portent aucune policy d’outil, chemin, connecteur, modèle ou budget : G2-005 reste
  hors périmètre. L’authentification reste Google-only : G2-006 reste hors périmètre.

## Scénarios positifs

### Contexte et portée

- Given : organisations `org_client_paris` et `org_msp_default`, site `paris`, operator affecté et
  mandat site/projet.
- When : l’operator consulte agents, threads, runs, artefacts, commandes et SSE.
- Then attendu : les résultats restent dans le site et, pour un mandat projet, dans le projet exact.
- Résultat observé : **vert** ; P-INT couvre le mandat projet et vérifie qu’un UUID voisin produit
  le même 404 sans effet.

### Même mission, rôles distincts

- Given : requester client, operator MSP mandaté et approver client.
- When : ils listent, créent, opèrent ou approuvent la mission.
- Then attendu : requester reste owner-scoped ; operator reçoit le périmètre mandaté ; approver reste
  client-scoped ; l’approbation allowed est auditée avec acteur, client et mandat.
- Résultat observé : **vert** ; l’audit `run.approve` porte les deux organisations et l’enveloppe v2.

### Administration du mandat

- Given : admin de l’organisation cliente.
- When : `POST /api/site/mandates`, affectation, révocation d’affectation puis révocation du mandat.
- Then attendu : chaque mutation est bornée au site, validée par la DB et auditée.
- Résultat observé : **vert** ; scénario API intégré dans `site-role-authorization.integration.test.ts`,
  avec annulation des runs actifs liés à l’affectation puis au mandat révoqués.

### Révocation d’un run actif

- Given : deux runs actifs snapshotés sur le même mandat, portés par deux opérateurs affectés.
- When : l’affectation du premier opérateur est révoquée, puis le mandat entier.
- Then attendu : le premier run est `cancelled` lors de la révocation d’affectation ; le second est
  `cancelled` lors de la révocation du mandat. Après redémarrage, le reconciler refuse aussi de
  reprendre un run dont le mandat ou l’affectation n’est plus actif.
- Résultat observé : **vert** en PostgreSQL Docker ; la preuve Hermes distant/restart reste P-E2E.

## Scénarios négatifs

### Operator sans affectation

- Given : affiliation MSP et membership `operator`, sans assignment individuelle.
- When : session et accès à un thread sont tentés.
- Then attendu : `MSP_MANDATE_REQUIRED`, session invalidée, aucune liste/lecture/commande/SSE.
- Résultat observé : **vert** ; l’événement `site.access` est denied et attribué.

### Révocation live

- Given : session operator et flux SSE ouverts, puis affectation révoquée.
- When : le prochain contrôle long-lived s’exécute.
- Then attendu : flux fermé, polling arrêté, cache invalidé, accès suivant refusé.
- Résultat observé : **vert** ; P-INT et test UI du terminal polling couvrent la séquence.

### Organisation voisine / UUID deviné

- Given : site ou projet voisin, UUID valide hors portée et UUID aléatoire.
- When : lecture, téléchargement, mutation ou approbation sont tentés.
- Then attendu : réponse indistinguable, audit denied, aucun effet runtime.
- Résultat observé : **vert** dans les campagnes site-context, ownership et site-role.

## Migration et ledger

- 0022 est expand/backfill/contract : le site legacy déterministe reçoit uniquement une organisation
  cliente si aucun operator historique n’est présent ; toute migration legacy ambiguë exige un
  staging explicite et rollbacke sinon. 0023 ajoute uniquement des colonnes nullable et un index
  pour conserver l’autorisation snapshotée des runs sans réécrire les missions historiques.
- Les entrées audit v1 restent nullables pour les snapshots organisationnels et ne sont pas rehashées.
  Les nouvelles écritures utilisent l’enveloppe v2 et le trigger SECURITY DEFINER vérifie le
  snapshot d’organisation et le mandat actif avant d’avancer la chaîne.
- La campagne de migration production couvre une installation fraîche, une mise à niveau 0018 et la
  neutralisation du rôle runtime hostile.

## Commandes et sorties expurgées

```text
bun run typecheck                                      # core, server, console : vert
bun test apps/server/drizzle/site-role-authorization.integration.test.ts
  12 pass · 178 assertions
bun test apps/server/drizzle/site-context-api.integration.test.ts
  2 pass · 37 assertions
bun test apps/server/drizzle/resource-ownership.integration.test.ts
  10 pass · 63 assertions
bun test apps/server/drizzle/audit-ledger-migration.test.ts
  2 pass · 16 assertions
bun test apps/server/src/db/production-migration.test.ts
  3 pass
bun test apps/server/src/routes.test.ts apps/server/src/api/auth/route.test.ts \
  apps/console/src/components/shell/nav-config.test.ts apps/console/src/lib/auth-site-context.test.ts \
  apps/console/src/route-tree.test.ts
  13 pass · 88 assertions
bun test
  368 pass · 0 fail · 1250 expect() calls · 75 fichiers
```

La campagne globale séquentielle atteint 368 tests passants sans échec. Le scénario de sortie
Hermes hors contexte HTTP vérifie aussi la résolution du mandat opérateur (organisation MSP,
organisation cliente et mandat dans l’audit v2). La P-E2E navigateur multi-compte et la revue
finale partenaire restent à exécuter.

## Limites ouvertes

- La sélection interactive entre plusieurs mandats simultanés n’est pas encore une surface UI : le
  serveur refuse alors fail-closed avec `MSP_MANDATE_SELECTION_REQUIRED`.
- Les sorties Hermes hors contexte HTTP résolvent automatiquement un mandat projet exact, puis un
  mandat site ; l’absence ou l’ambiguïté du mandat fait échouer la livraison et l’audit plutôt que
  d’émettre une preuve opérateur incomplète.
- Une révocation annule désormais les runs actifs snapshotés dans la Console et empêche leur reprise
  après redémarrage ; l’arrêt effectif d’un run Hermes distant et la résilience réseau restent à
  prouver par P-E2E sur le runtime réel.
- Le dashboard n’appelle plus les agents sans `agent.read`, les actions créer/annuler/relancer des
  Missions suivent les capabilities et le lien Paramètres global est masqué tant que
  `installation.admin` n’existe pas. La P-E2E par persona doit encore confirmer ces parcours et
  les accès directs aux routes.
- Le provisioning d’une première organisation MSP, de son affiliation et de sa membership opérateur
  reste une opération bootstrap SQL/documentée, sans parcours produit audité.
- `bun run lint` reste rouge sur trois erreurs préexistantes de `use-live-thread.ts` (hors diff
  G2-004), malgré les typechecks et la suite Bun verte.
- P-E2E navigateur, P-SEC multi-compte et acceptation produit/sécurité restent ouverts.
- Gate 1 reste bloquée par US-G1-008 ; ce rapport ne vaut pas acceptation de Gate 2.

## Verdict

**IMPLÉMENTÉE — techniquement vérifiée localement ; non ACCEPTÉE avant P-E2E, revue sécurité et Gate 1.**

## Acceptation reviewer

- Nom/identifiant : à renseigner
- Date : à renseigner
- Décision : à renseigner (`ACCEPTÉE` | `REFUSÉE`)
