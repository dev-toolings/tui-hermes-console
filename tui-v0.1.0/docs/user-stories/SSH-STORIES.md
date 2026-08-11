# Gate 1 — Stories SSH détaillées

Ces stories décomposent l'epic US-G1-008. Elles ont chacune un état et une preuve propres ; aucune
preuve partielle ne permet d'accepter l'epic. Le transfert de fichiers distant est supprimé par décision produit du 08-08-2026, stories et code compris :
SSH-006, SSH-007 et SSH-009 ne sont plus des travaux ni des bloqueurs de Gate 1. Le tunnel SSH et
la gestion d'identité restent dans le scope. Le guide d'exécution associé est
[`guides/SSH-VPS-VIERGE.md`](guides/SSH-VPS-VIERGE.md).

~~~text
┌──────────────────┐
│ Bootstrap admin  │
└────────┬─────────┘
         │ clés publiques · recovery prouvé
         ▼
┌──────────────────┐
│ Compte de service│
└────────┬─────────┘
         │ empreinte pinnée · identité autorisée
         ▼
┌──────────────────┐
│ Tunnel SSH       │
└────────┬─────────┘
         │ health · capabilities · refus
         ▼
┌──────────────────┐
│ Rotation + reprise│
└──────────────────┘
~~~

Légende : chaque flèche désigne la preuve requise avant l'étape suivante. Composants : accès
recovery, compte SSH de service, transports Hermes, cycle de vie des identités.

**Reviewer commun :** responsable sécurité/exploitation distinct de l'implémenteur.

> **DÉGEL PARTIEL — actualisé le 04-08-2026.** Une VM vierge est maintenant provisionnée par
> Terraform/pvecli et Ansible : [preuve VM](evidence/2026-08-04-ssh-003-005-hermes-ephemeral-01.md).
> SSH-001, SSH-003 et SSH-004 disposent d'une preuve technique ; SSH-002 conserve une réserve sur
> les empreintes RSA/ECDSA, et SSH-005/008 restent dépendantes d'Hermes réel et de la revue
> indépendante. Le transfert distant et ses stories SSH-006/007/009 sont supprimés. La [décision de gel historique](evidence/2026-08-04-ssh-001-gel-decision.md)
> explique pourquoi la campagne n'avait pas été lancée plus tôt. `US-G1-SSH-010` reste `VÉRIFIÉE`.

## US-G1-SSH-001 — Bootstrapper un VPS sans notre clé

> En tant qu'administrateur, je veux installer les clés publiques via le fournisseur, afin d'obtenir
> le premier accès sans exposer de clé privée ni dépendre durablement de root.

- **Dépendances :** US-G1-002 ; VPS dédié et réellement vierge.
- **Positif :** l'accès console/KVM, cloud-init, recovery ou password temporaire installe séparément
  les clés admin et service ; deux connexions batch à chaque compte réussissent.
- **Négatif :** une clé privée, un secret en argument ou un hôte déjà occupé bloque la recette sans
  mutation supplémentaire.
- **Preuves :** `P-OPS`, méthode fournisseur, comptes, codes de sortie et inventaire avant/après.
- **État courant :** `VÉRIFIÉE` techniquement sur `hermes-ephemeral-01` ; revue indépendante et
  acceptation Gate restent ouvertes.
- **Preuve :** clés admin/service installées par Ansible, connexions batch et négatifs SSH rejoués.

## US-G1-SSH-002 — Établir la confiance dans la clé d'hôte

> En tant qu'opérateur, je veux vérifier l'empreinte hors bande, afin de refuser un serveur inconnu ou
> remplacé avant de lui présenter une identité.

- **Dépendance :** US-G1-SSH-001.
- **Positif :** l'empreinte fournisseur correspond exactement au `known_hosts` dédié et strict.
- **Négatif :** fichier vide, clé différente ou révoquée ; échec avant authentification, sans
  `accept-new` ni validation interactive.
- **Preuves :** `P-SEC`, algorithme/empreinte, codes de sortie et config effective.
- **État courant :** `BLOQUÉE` — la concordance ED25519 est vérifiée, mais les empreintes fournisseur
  RSA/ECDSA et la revue d'acceptation restent à fournir.
- **Preuve récente :** [preuve SSH-001/002 sur VM vierge](evidence/2026-08-04-ssh-001-002-hermes-ephemeral-01.md).

## US-G1-SSH-003 — Séparer admin et compte de service

> En tant que responsable exploitation, je veux un admin recovery et un compte `hermes-console`
> sans privilège, afin de durcir SSH sans verrouiller l'hôte ni donner root à la Console.

- **Dépendances :** US-G1-SSH-001, US-G1-SSH-002.
- **Positif :** l'admin prouve son élévation ; le service est sans sudo/Docker ; root/password ne sont
  désactivés qu'après reload validé et nouvelles connexions réussies.
- **Négatif :** absence de chemin admin, auto-élévation du service ou compte service dans un groupe
  privilégié ; durcissement refusé.
- **Preuves :** `P-OPS`, `P-SEC`, `sshd -t`, groupes, permissions et test recovery.
- **État courant :** `VÉRIFIÉE` techniquement sur la VM de preuve ; revue indépendante ouverte.

## US-G1-SSH-004 — Authentifier la clé autorisée et refuser les autres

> En tant qu'opérateur, je veux une authentification publickey déterministe, afin qu'aucun fallback
> mot de passe ou agent inattendu ne donne accès au service.

- **Dépendance :** US-G1-SSH-003.
- **Positif :** la seule clé autorisée se connecte avec `IdentitiesOnly` et `BatchMode`.
- **Négatif :** clé inconnue ou révoquée ; exit non nul, aucune session, écriture ni fallback.
- **Preuves :** `P-SEC`, empreintes publiques, config et logs expurgés.
- **Préparation code disponible :** les invocations système `ssh` et `scp` imposent désormais
  `BatchMode=yes` et `IdentitiesOnly=yes` ; l’overlay Compose SSH opt-in fournit le dossier de
  config/identité en lecture seule sans modifier le Compose de base.
- **État courant :** `VÉRIFIÉE` techniquement sur la VM de preuve ; la clé inconnue et l'ancien compte
  `ops` sont refusés, sans fallback password/agent.

## US-G1-SSH-005 — Borner le tunnel à Hermes

> En tant que responsable sécurité, je veux un forward limité à `127.0.0.1:8642`, afin que la Console
> ne puisse pas pivoter vers les autres services du VPS.

- **Dépendances :** US-G1-SSH-003, US-G1-002.
- **Positif :** `PermitOpen` autorise health/capabilities Hermes sur loopback et le port local ferme à
  l'arrêt.
- **Négatif :** autre port/destination, Hermes absent, changement de cible ou empreinte ; forward
  refusé sans faux succès ni listener résiduel.
- **Preuves :** `P-INT`, `P-SEC`, réponses API, listeners avant/après et refus de pivot.
- **État courant :** `VÉRIFIÉE` techniquement — le pivot vers SSH est refusé et le compte service
  atteint le runtime Docker sur `127.0.0.1:8642` (`health=ok`). Revue indépendante ouverte.
- **Preuve :** [G1-002 latest/main et update UI sur VM](evidence/2026-08-04-g1-002-latest-docker-native.md).

## US-G1-SSH-008 — Tourner et révoquer une identité active

> En tant qu'administrateur, je veux tourner et révoquer une clé dans un délai borné, afin qu'une
> ancienne identité perde aussi ses sessions multiplexées existantes.

- **Dépendances :** US-G1-SSH-003, US-G1-SSH-005.
- **Positif :** la nouvelle clé fonctionne, l'ancienne ligne est retirée, ses ControlMaster/tunnels
  actifs sont fermés côté serveur et le SLA de révocation est mesuré.
- **Négatif :** ancienne nouvelle connexion ou ancien canal encore utilisable après le SLA ; story
  rejetée, même si `authorized_keys` a changé.
- **Preuves :** `P-OPS`, `P-SEC`, empreintes, sessions avant/après et durée mesurée.
- **Preuve technique disponible :** [rejeu SSH-008 du 04-08-2026](evidence/2026-08-04-ssh-008-hermes-ephemeral-01.md) :
  nouvelle clé fonctionnelle, ancienne connexion refusée, ControlMaster fermé côté serveur et SLA
  mesuré à environ 315 ms.
- **État courant :** `VÉRIFIÉE` techniquement — revue indépendante et opérateur 2 restent requis
  avant l'acceptation Gate 1.

## US-G1-SSH-010 — Migrer le stockage Docker sans perdre `/opt/data`

> En tant qu’opérateur, je veux migrer un volume nommé vers un bind mount explicite, afin que la
> Console et Hermes partagent un workspace durable sans dépendre des chemins internes de Docker.

- **Dépendances :** US-G1-SSH-005 ; conteneur Hermes reconnu et image épinglée.
- **Positif :** un préflight sans mutation inventorie tout `/opt/data`, exige une confirmation
  exacte, survit à un rechargement UI, bloque les nouvelles missions, conserve l’ancien volume/conteneur, compare les manifestes,
  recrée Hermes sur `/srv/hermes-console/data → /opt/data`, prouve health/capabilities/écriture
  Hermes, puis persiste le mapping par révision CAS.
- **Négatif :** cible non vide, espace insuffisant, image non pinnée, topologie personnalisée,
  manifeste divergent, API invalide ou coupure ; aucun succès n’est persisté et le runtime précédent
  est restauré, sinon l’état `récupération requise` bloque les missions.
- **Preuves :** `P-INT`, `P-E2E`, journal PostgreSQL, inventaires et manifestes expurgés, montage
  Docker avant/après, runtime et artefact réels, rollback ou reprise après redémarrage.
- **Revalidation courante :** [preuve PVE du 08-08-2026](evidence/2026-08-08-gate-1-ssh-storage-current.md) —
  provisioning complet, API/Dashboard loopback, manager de privilèges borné, second passage
  idempotent et round-trip input/output par bind mount, sans transfert distant.
- **État courant :** `VÉRIFIÉE` techniquement sur l'arbre courant ; dépendances normatives,
  sauvegarde externe et acceptation reviewer restent ouvertes.
