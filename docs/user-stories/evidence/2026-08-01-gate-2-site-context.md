# Preuve US-G2-001 — Isolation par site et projet

- Date/heure UTC : 2026-08-01T10:29:24Z (rédaction du rapport ; commandes reproduites ci-dessous)
- Story : US-G2-001
- Commit/build : `75075bc`, branche `feat/us-g2-001-site-context`
- Environnement : local, PostgreSQL 17 réel en conteneur éphémère
- Opérateur : `codex-root`
- Reviewer : Vador (contre-audit technique) ; product owner à faire
- Cible : deux sites synthétiques `paris` et `lyon`
- Versions Console/Hermes/PostgreSQL/OpenSSH : Console du commit `75075bc`, Hermes non requis,
  image `postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94`,
  OpenSSH non requis
- État technique : `VÉRIFIÉE`
- Décision de Gate : non émise — Gate 1 n'est pas encore acceptée
- Périmètre exclu : US-G2-005 et US-G2-006

## Contrat vérifié

Étant donné deux sites, leurs projets et leurs ressources, un membre possède un
`SiteRequestContext` dérivé côté serveur depuis sa session et ses memberships.
Les listes ne retournent que le site actif. Une session sans membership échoue
fermée ; une session multi-site sans choix explicite ne peut pas ouvrir le
produit.

Pour un identifiant aléatoire ou appartenant à un autre site, les routes
d'agent, thread, run, SSE et fichier répondent par le même refus, sans lookup
global du propriétaire, sans mutation métier et sans effet runtime/disque/flux.

## Preuves

### P-CODE

- Contexte serveur et sélection : `apps/server/src/modules/auth/service.ts`.
- Garde Hono et propagation : `apps/server/src/index.ts` et
  `apps/server/src/modules/api/route-context.ts`.
- Dépôts scopés : agents, connecteurs, threads, runs, artefacts, fichiers et
  statistiques sous `apps/server/src/`.
- Sélection UI et switch avec purge des états dérivés :
  `apps/console/src/screens/setup.tsx` et
  `apps/console/src/components/shell/nav-user.tsx`.
- Migration : `apps/server/drizzle/0020_session_site_context.sql`.

### P-INT

```text
bun test apps/server/drizzle/site-project-foundations-migration.test.ts
3 pass, 0 fail, 31 expect() calls
```

La migration `0020` est rejouée sur PostgreSQL réel ; le backfill mono/multi-site,
la FK composite session/membership et la suppression des cinq defaults sont
vérifiés.

```text
bun test apps/server/drizzle/site-context-api.integration.test.ts
2 pass, 0 fail, 37 expect() calls
```

Deux sites réels sont chargés. Les listes sont limitées au site acteur. Les IDs
étrangers et aléatoires produisent les mêmes réponses 404 et douze entrées de
ledger uniformes.

Le test d'input scope est également exécuté :

```text
bun test ./apps/server/src/modules/auth/site-context-input.test.ts
2 pass, 0 fail
```

### P-SEC

La campagne inter-site vérifie que les snapshots métier restent inchangés et
que les doubles d'effets runtime, arrêt, approbation, suppression de session,
SSE, suppression de fichier et lecture d'octets ne sont jamais appelés. Les
champs `siteId` et `projectId` fournis dans les JSON métier sont rejetés.

## Limites ouvertes

- aucune preuve E2E navigateur monté Hono + OAuth + sélection multi-compte ;
- aucune campagne PostgreSQL dédiée à la concurrence bootstrap/switch ;
- la PINT couvre les routes dynamiques critiques, pas chaque route future ;
- la story ne couvre pas le RBAC (US-G2-002), les policies (US-G2-005) ni l'OIDC
  entreprise (US-G2-006).

La story ne peut pas être `ACCEPTÉE` tant que sa dépendance Gate 1 et la revue
du product owner/responsable sécurité ne sont pas clôturées.

## Préconditions

- Les migrations 0011 à 0020 sont appliquées dans le conteneur PostgreSQL de test.
- Le daemon Docker est disponible.
- Les valeurs métier et les identifiants sont synthétiques.

## Scénario positif

- Given : deux sites, leurs projets et leurs ressources, avec un membre actif sur `paris`.
- When : les routes de liste sont appelées avec le contexte site serveur.
- Then attendu : seules les ressources `paris` sont retournées.
- Résultat observé : agents, connecteurs, threads et fichiers retournent uniquement `paris`.
- Code de sortie/ID de corrélation : code 0 ; `p-int-site-scope`.

## Scénarios négatifs

### Identifiant étranger ou aléatoire

- Given : membre du site `paris`, identifiant d'une ressource `lyon` puis identifiant inexistant.
- When : lecture, suppression, annulation, approbation, SSE ou téléchargement.
- Then attendu : même 404, aucune fuite d'existence, aucun effet.
- Résultat observé : 12 refus auditables, snapshots inchangés, effets externes non appelés.
- Absence d'effet vérifiée par : compteurs PostgreSQL et doubles d'effets runtime/disque/flux.

## Commandes et sorties expurgées

```text
bun test apps/server/drizzle/site-project-foundations-migration.test.ts
3 pass, 0 fail, 31 expect() calls
bun test apps/server/drizzle/site-context-api.integration.test.ts
2 pass, 0 fail, 37 expect() calls
bun test ./apps/server/src/modules/auth/site-context-input.test.ts
2 pass, 0 fail
```

## Inventaire/hash avant et après

Les comptes d'agents, threads et artefacts ainsi que le statut du run `lyon` sont identiques avant
et après la campagne négative. Aucun octet réel n'est lu ou écrit.

## Incidents, écarts et dérogations

Pas d'incident. La preuve n'est pas une E2E navigateur et ne clôt pas la dépendance Gate 1.

## Nettoyage

Le conteneur PostgreSQL éphémère et ses données synthétiques sont supprimés après le test.

## Acceptation reviewer

- Nom/identifiant : à renseigner par le product owner et le responsable sécurité habilités
- Date : à renseigner
- Décision : `ACCEPTÉE` | `REFUSÉE` — en attente
