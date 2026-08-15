# Post-mortem, 15-08-2026 : trois pannes au démarrage local

Statut : clos côté code, une action reste à la main de l'opérateur.
Portée : environnement de développement uniquement, aucune installation déployée touchée.

## Résumé

Trois pannes se sont enchaînées en une session sur `make dev`, chacune bloquant
la précédente. Elles se ressemblent au point d'être la même : une valeur de
configuration avait dérivé de la réalité, rien ne le disait, et l'échec
apparaissait plusieurs couches plus loin sous une forme qui ne nommait ni la
variable ni la valeur fautive.

| # | Symptôme vu par l'opérateur | Cause réelle | Distance symptôme/cause |
|---|---|---|---|
| 1 | `3D000` noyé dans les logs Vite | base `hermes_console` absente | 1 couche |
| 2 | `ERR_EMPTY_RESPONSE` dans Chrome | `GOOGLE_REDIRECT_URI` sur un port abandonné | 3 couches |
| 3 | `Erreur 400 : redirect_uri_mismatch` | URI absente de la console Google Cloud | hors du dépôt |

## Chronologie

1. `make dev` démarre, le serveur meurt sur `3D000`. `bun --watch` ne relance
   rien tant qu'aucun fichier ne bouge, donc le port reste muet sans qu'aucune
   ligne ne le dise. La cible `db-check` existait et savait créer la base, mais
   seule `setup` en dépendait.
2. Base créée et migrée, 36 tables. Le parcours Google renvoie sur
   `localhost:1420`. Le port du SPA était passé à 1470 au commit `dbaddfb`,
   `.env.local` est hors git et n'a pas suivi. Aggravant : un autre projet local
   écoute sur 1420, d'où une réponse vide plutôt qu'un refus de connexion, et un
   code d'autorisation livré à un tiers.
3. `.env.local` réaligné sur `127.0.0.1:3170`, Google refuse : cette URI n'était
   pas enregistrée côté Google Cloud. Le dépôt était enfin cohérent avec
   lui-même, mais pas avec la copie qui vit chez le fournisseur d'identité.

## Cause commune

```
        La même valeur, trois copies, aucune synchronisation

  ┌────────────────┐   ┌────────────────────┐   ┌──────────────────────┐
  │ Le dépôt       │   │ apps/server/       │   │ Console Google Cloud │
  │ Makefile, vite │   │ .env.local         │   │ URI de redirection   │
  │ .env.example   │   │ (hors git)         │   │ (hors machine)       │
  └───────┬────────┘   └─────────┬──────────┘   └──────────┬───────────┘
          │                      │                         │
          │  panne 2 : le dépôt bouge, la copie locale non  │
          └──────────────────────┤                         │
                                 │  panne 3 : le local bouge, la copie
                                 └─────────────────────────┘  distante non

  Panne 1, même forme : le schéma attendu par le code contre celui de la base.

  Légende : chaque flèche est un écart possible. Aucun n'était vérifié, et
  aucun ne se signalait à l'endroit où il naissait.
```

Ces trois pannes ne sont pas des erreurs d'inattention à corriger une par une.
C'est une conception qui laisse diverger des copies sans jamais les comparer.
Le correctif utile n'est donc pas la bonne valeur, c'est le contrôle qui hurle
quand les copies divergent.

## Ce qui a été corrigé

Un principe commun : rapprocher la détection de la source, et faire échouer tôt
avec une ligne qui nomme la variable et la valeur attendue.

1. `Makefile` : `dev` et `api` dépendent de `db-check`, comme `setup`. Une base
   absente est créée avant le lancement au lieu de tuer le serveur après.
2. `apps/server/src/modules/auth/local-oauth-routing.ts` : garde au démarrage.
   Il refuse de servir si le callback vise un port qui n'atteint pas la Console,
   ou si le callback et le SPA n'ont pas le même hôte local. Ce second cas est
   un piège distinct, caché derrière le premier : les cookies ignorent le port
   mais pas l'hôte, donc `hc_oidc_state` ne survit pas à un passage de
   `localhost` à `127.0.0.1`, et la vérification du `state` échoue sans motif
   lisible. Les deux règles ne portent que sur du loopback en clair, donc ne se
   déclenchent jamais en production ni sous Tauri.
3. `apps/server/src/index.ts` : le log de démarrage affiche l'URI de callback
   attendue. C'est la valeur exacte à enregistrer côté Google, disponible sans
   la reconstituer à la main, ce qui est précisément ce que la panne 3 a coûté.

## Ce qui reste ouvert

- **Aucune vérification automatique contre Google Cloud.** Rien dans le dépôt ne
  peut lire les URI enregistrées chez le fournisseur d'identité sans lui confier
  des accès d'administration, ce qui coûterait plus cher que la panne. Le garde
  détecte donc les écarts internes, jamais l'écart distant. Le log de démarrage
  est le compromis retenu : il rend la valeur à recopier évidente.
- **Action opérateur** : enregistrer `http://127.0.0.1:3170/api/auth?action=callback`
  dans les URI de redirection autorisées, et retirer l'entrée en `1420`, qui
  pointe vers un port tenu par un autre projet local.

## Décision annexe prise pendant la session

L'accès depuis le réseau local a été ouvert pour tester le SPA mobile, ce qui a
demandé d'assouplir le garde du bypass d'authentification locale. Google refuse
les adresses IP privées comme URI de redirection, donc aucune session ne pouvait
exister sur l'origine LAN. `CONSOLE_DEV_LAN_ORIGIN` autorise les origines
qu'elle nomme, et elles seules, à ouvrir une session sans Google.

Ce que cela coûte, écrit ici pour que la décision reste relisible : tant que le
serveur de développement tourne avec `CONSOLE_DEV_AUTH_BYPASS=1`, un appareil du
réseau local atteignant cette origine ouvre une session sans mot de passe. Les
trois autres verrous tiennent, la variable est ignorée en production, et vider
`CONSOLE_DEV_LAN_ORIGIN` referme le garde sans autre changement.

## Ce qu'on retient

- Une valeur dupliquée hors du dépôt finit toujours par diverger. Ce qui compte
  n'est pas de la synchroniser à la main, c'est de rendre l'écart bruyant.
- Une panne dont le symptôme est à trois couches de sa cause coûte plus qu'une
  panne franche. `port-free` appliquait déjà ce principe aux ports, il manquait
  à la base et à la configuration OAuth.
- Un port abandonné n'est pas un port libre. Un autre service peut y répondre,
  et recevoir au passage ce qui ne lui était pas destiné.
