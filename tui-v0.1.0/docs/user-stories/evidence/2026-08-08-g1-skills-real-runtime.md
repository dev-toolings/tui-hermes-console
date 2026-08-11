# Preuve partielle — inventaire des skills sur le runtime réel

- Date : 08-08-2026
- Story : `US-G1-SKILLS-001`
- Environnement : Console locale, tunnel SSH du projet, Hermes `0.20.0` sur la VM PVE 210
- Navigateur : session Ghostchrome neuve `ux001-20260808`
- Verdict : `IMPLÉMENTÉE, PARTIELLEMENT VÉRIFIÉE`

## Observation réelle

La route `/skills` a chargé l'inventaire fourni par le Dashboard Hermes distant :

- `69 sur 69 skills` affichés ;
- périmètre annoncé : `Tous les projets du site` ;
- douze lignes visibles sur la première page ;
- douze switches observés, tous actifs et non désactivés ;
- runtime affiché `Connecté · 0.20.0` via le tunnel SSH configuré.

La capture expurgée est conservée hors Git sous
`/home/kev/.codex/artifacts/ux001-20260808/g1-skills-real-runtime.png`, SHA-256
`0673e8e9a2413830deda8673fea3b8322e869538b84e39fb53d259b75dcbe99b`.

## Contrats automatiques

Commande :

```text
bun test \
  apps/server/src/modules/runtime/hermes-skills-admin.test.ts \
  apps/server/src/routes.test.ts
```

Résultat : `8 pass`, `0 fail`, `151 expect()`, Bun `1.3.13`.

Les tests prouvent que chaque route montée possède une frontière d'autorisation et que la session
éphémère du Dashboard n'est jamais inventée lorsqu'elle est absente. La route `GET /api/skills` est
classée `agent.read` et `PUT /api/skills/toggle` est classée `agent.update`.

## Limites ouvertes

- aucun switch du runtime réel n'a été modifié pendant cette preuve read-only ;
- le positif toggle + restauration et le refus HTTP d'un rôle sans `agent.update` restent à exécuter ;
- la preuve ne vaut ni revue sécurité, ni acceptation produit, ni acceptation Gate 1.

## Reviewer attendu

Opérateur runtime et reviewer sécurité, distincts de l'implémenteur.
