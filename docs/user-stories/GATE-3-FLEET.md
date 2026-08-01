# Gate 3 — Edge/Relay et fleet

**Reviewer final :** responsable architecture et sécurité, après besoin fleet confirmé.

**Critère de sortie :** enrôlement révocable, connexion sortante et lifecycle borné démontrés sur
plusieurs runtimes.

~~~text
╔════════════════════╗
║ Console            ║
║ identité · policy  ║
╚═════════╤══════════╝
          │ ticket court · commande autorisée
          ▼
╔════════════════════╗
║ Edge / Relay       ║
║ identité de site   ║
╚═════════╤══════════╝
          │ API privée · action bornée
          ▼
┌────────────────────┐
│ Hermes du site     │
└────────────────────┘
~~~

Légende : la Console décide, Edge/Relay accède, Hermes exécute ; les flèches nomment les contrats de
commande. Composants : control plane, frontière de site, runtime.

## US-G3-001 — Enrôler avec un secret court

> En tant qu'opérateur, je veux enrôler une installation avec un secret court et à usage unique,
> afin de ne pas distribuer un credential permanent.

- **Dépendance :** Gate 2 acceptée.
- **Acceptation positive :** Étant donné un code lié au site, expirant et mono-usage, quand
  l'installation l'utilise, alors une identité est créée et le code devient inutilisable.
- **Acceptation négative :** Étant donné un code expiré, rejoué, altéré ou destiné à un autre site,
  quand l'enrôlement est tenté, alors aucune identité partielle ou orpheline n'est créée.
- **Preuves :** `P-INT`, `P-SEC`, quatre refus, audit et inventaire avant/après.
- **État initial :** `PROPOSÉE`.

## US-G3-002 — Authentifier, tourner et révoquer l'installation

> En tant qu'administrateur fleet, je veux une identité mTLS rotative et révocable, afin de couper un
> site compromis sans dépendre d'un mot de passe partagé.

- **Dépendance :** US-G3-001.
- **Acceptation positive :** Étant donné une identité valide, quand elle se connecte puis tourne,
  alors la continuité suit la fenêtre définie et l'ancienne identité cesse ensuite d'être acceptée.
- **Acceptation négative :** Étant donné un certificat inconnu, expiré, révoqué, d'un mauvais site ou
  d'une chaîne invalide, quand le handshake est tenté, alors il est refusé, aucune commande n'est
  remise et la tentative est auditée.
- **Preuves :** `P-INT`, `P-OPS`, `P-SEC`, empreintes publiques, CRL/état de révocation et tests de
  rotation/expiration.
- **État initial :** `PROPOSÉE`.

## US-G3-003 — Traverser le NAT par connexion sortante

> En tant qu'opérateur de site, je veux que l'installation initie une connexion sortante chiffrée,
> afin de ne pas ouvrir Hermes ou SSH à Internet.

- **Dépendance :** US-G3-002.
- **Acceptation positive :** Étant donné un réseau sans port entrant, quand Edge initie puis reprend
  son canal autorisé, alors Hermes reste joignable uniquement en privé.
- **Acceptation négative :** Étant donné un relais non authentifié, un endpoint changé, une commande
  expirée ou une coupure réseau, quand un message circule, alors il est refusé ou repris idempotemment
  sans exposition de port ni duplication.
- **Preuves :** `P-E2E`, `P-OPS`, `P-SEC`, règles réseau, scan externe, reconnexion et déduplication.
- **État initial :** `PROPOSÉE`.

## US-G3-004 — Inventorier plusieurs runtimes

> En tant qu'opérateur fleet, je veux voir heartbeat, capabilities, version et capacité de plusieurs
> runtimes, afin de router le travail sans confondre les sites.

- **Dépendances :** US-G3-002, US-G3-003.
- **Acceptation positive :** Étant donné au moins deux runtimes de sites distincts avec état
  horodaté, quand une mission est routée, alors elle atteint uniquement la cible autorisée compatible.
- **Acceptation négative :** Étant donné un heartbeat ancien, une capability absente, un runtime
  saturé ou un identifiant de site falsifié, quand une nouvelle mission arrive, alors elle est refusée
  ou routée selon policy sans cross-site.
- **Preuves :** `P-INT`, `P-E2E`, `P-SEC`, inventaire horodaté, routage et quatre cas de refus.
- **État initial :** `PROPOSÉE`.

## US-G3-005 — Distinguer external, connected et managed

> En tant que propriétaire client, je veux choisir le niveau de gestion d'un runtime, afin qu'une
> connexion existante n'accorde pas implicitement le lifecycle.

- **Dépendance :** US-G3-004.
- **Acceptation positive :** Étant donné les niveaux `external`, `connected` et `managed`, quand une
  commande ou transition est demandée, alors seule la matrice du niveau s'applique avec autorisation
  et audit.
- **Acceptation négative :** Étant donné une commande de niveau supérieur, un downgrade pendant une
  opération ou une déconnexion, quand elle est tentée, alors le refus est sûr, les données runtime
  sont conservées et aucune suppression n'est implicite.
- **Preuves :** `P-INT`, `P-E2E`, `P-SEC`, matrice niveaux/actions et test de déconnexion non
  destructive.
- **État initial :** `PROPOSÉE`.

## US-G3-006 — Exécuter le lifecycle sans socket Docker

> En tant qu'opérateur fleet, je veux restart, upgrade, rollback et backup via une API bornée sur les
> seuls runtimes `managed`, afin de ne pas donner un shell ou le socket Docker au control plane.

- **Dépendance :** US-G3-005.
- **Acceptation positive :** Étant donné un runtime `managed`, quand restart, upgrade, rollback ou
  backup est demandé, alors niveau, capability, version, idempotence et santé sont vérifiés ; un
  upgrade échoué revient à la version précédente et le backup est restaurable.
- **Acceptation négative :** Étant donné un runtime non managed, une capability absente, une version
  interdite, une commande rejouée ou une recherche du socket Docker, quand l'opération est demandée,
  alors elle est refusée sans mutation partielle ni accès générique à l'hôte.
- **Preuves :** `P-OPS`, `P-SEC`, journal des quatre opérations, rollback, restauration, inspection des
  mounts et preuve d'absence de socket.
- **État initial :** `PROPOSÉE`.
