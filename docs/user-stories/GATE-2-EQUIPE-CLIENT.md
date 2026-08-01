# Gate 2 — Équipe et client

**Reviewer final :** product owner et responsable sécurité d'un partenaire pilote.

**Critère de sortie :** séparation opérateur MSP/client final démontrée par tests croisés.

## US-G2-001 — Isoler par site et projet

> En tant qu'administrateur MSP, je veux rattacher toute ressource à un site et éventuellement un
> projet, afin d'empêcher le partage global implicite.

- **Dépendance :** Gate 1 acceptée.
- **Acceptation positive :** Étant donné deux sites, leurs projets et leurs ressources, quand un
  membre liste son périmètre, alors chaque requête retourne uniquement le site sélectionné et les
  anciennes lignes ont été migrées vers un site explicite.
- **Acceptation négative :** Étant donné un identifiant omis, falsifié ou issu d'un autre site, quand
  une lecture ou mutation est tentée, alors l'API refuse sans fuite d'existence ni mutation.
- **Preuves :** `P-CODE`, `P-INT`, `P-SEC`, migration/backfill, tests de requêtes croisées et preuve
  d'absence de ressource orpheline.
- **État initial :** `PROPOSÉE`.
- **État courant au 2026-08-01 :** `VÉRIFIÉE` techniquement, non `ACCEPTÉE` tant que la Gate 1 et
  la revue finale ne sont pas clôturées.
- **Preuve datée :** [`2026-08-01-gate-2-site-context.md`](evidence/2026-08-01-gate-2-site-context.md).

## US-G2-002 — Appliquer les cinq rôles

> En tant qu'administrateur, je veux attribuer `admin`, `operator`, `requester`, `approver` et
> `auditor`, afin de séparer administration, exécution, demande, décision et lecture de preuve.

- **Dépendance :** US-G2-001.
- **Acceptation positive :** Étant donné la matrice des cinq rôles, quand chaque rôle agit dans son
  site, alors il exécute seulement les actions qui lui sont attribuées.
- **Acceptation négative :** Étant donné chaque rôle, quand il tente une action interdite ou sa propre
  élévation, alors le refus est stable, l'état reste inchangé et l'audit est attribué.
- **Preuves :** `P-INT`, `P-E2E`, `P-SEC`, matrice permissions/actions versionnée et campagne croisée.
- **État initial :** `PROPOSÉE`.

## US-G2-003 — Posséder agents, missions, artefacts et connecteurs

> En tant qu'opérateur, je veux un propriétaire explicite sur chaque ressource métier, afin que
> création, délégation et révocation soient contrôlables.

- **Dépendances :** US-G2-001, US-G2-002.
- **Acceptation positive :** Étant donné un créateur autorisé, quand il crée ou transfère une
  ressource, alors celle-ci conserve site, projet, propriétaire, auteur et historique avant/après.
- **Acceptation négative :** Étant donné un utilisateur hors périmètre, quand il lit, modifie,
  exécute, télécharge ou transfère la ressource, alors toutes les voies API et UI refusent sans fuite.
- **Preuves :** `P-CODE`, `P-INT`, `P-SEC`, invariants DB, matrice CRUD par ressource et audit de
  transfert.
- **État initial :** `PROPOSÉE`.

## US-G2-004 — Séparer l'opérateur MSP du client final

> En tant que client final, je veux voir et demander uniquement mon travail, tandis que le MSP peut
> opérer le site selon mandat, afin de ne pas exposer les autres clients.

- **Dépendances :** US-G2-002, US-G2-003.
- **Acceptation positive :** Étant donné un requester client, un operator MSP mandaté et un approver,
  quand ils traitent la même mission, alors chacun voit le sous-ensemble utile et l'audit distingue
  organisation opératrice et cliente.
- **Acceptation négative :** Étant donné un opérateur sans mandat ou un client voisin, quand il devine
  une URL/UUID, alors la réponse ne révèle rien, aucun téléchargement/SSE ne démarre et la tentative
  est auditée.
- **Preuves :** `P-E2E`, `P-SEC`, parcours multi-comptes, contrôle des flux SSE et artefacts.
- **État initial :** `PROPOSÉE`.

## US-G2-005 — Appliquer des policies par ressource

> En tant qu'administrateur de site, je veux borner outils, chemins, connecteurs, modèles et budgets,
> afin que la délégation reste compatible avec le contrat client.

- **Dépendances :** US-G2-002, US-G2-003, US-G1-004.
- **Acceptation positive :** Étant donné une mission dans les limites, quand elle s'exécute, alors
  elle utilise seulement les ressources autorisées et enregistre la version de policy évaluée.
- **Acceptation négative :** Étant donné un outil, chemin, connecteur, modèle ou budget interdit,
  quand il est demandé, alors la tentative échoue avant effet et produit une décision auditable.
- **Preuves :** `P-INT`, `P-E2E`, `P-SEC`, cinq cas de refus et tests de conflit entre policies.
- **État initial :** `PROPOSÉE`.

## US-G2-006 — Qualifier l'identité entreprise

> En tant qu'administrateur client, je veux utiliser mon fournisseur OIDC et, si la demande est
> prouvée, un cycle SAML/SCIM, afin d'intégrer les accès à ma gouvernance existante.

- **Dépendance :** US-G2-002.
- **Acceptation positive :** Étant donné un IdP OIDC générique, quand l'utilisateur s'authentifie,
  alors issuer, audience, signature, nonce, PKCE et claims sont validés avant les rôles locaux.
  SAML/SCIM n'est accepté qu'avec un besoin partenaire documenté et ses tests de
  provisioning/deprovisioning.
- **Acceptation négative :** Étant donné issuer/audience/signature/nonce invalides, email non vérifié,
  utilisateur désactivé ou claim de rôle forgé, quand une session est demandée, alors elle est
  refusée ou révoquée sans élévation.
- **Preuves :** `P-INT`, `P-E2E`, `P-SEC`, matrice des claims, tests de tamper et révocation.
- **État initial :** `PROPOSÉE`.
