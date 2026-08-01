# Preuve US-G2-001 — Isolation par site et projet

**Date :** 2026-08-01

**Branche :** `feat/us-g2-001-site-context`

**Commit de référence :** `75075bc`

**État technique :** `VÉRIFIÉE`

**Décision de Gate :** non émise — Gate 1 n'est pas encore acceptée
**Périmètre exclu :** US-G2-005 et US-G2-006

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
