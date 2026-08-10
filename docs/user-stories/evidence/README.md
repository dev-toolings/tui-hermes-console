# Rapports de preuve

Un rapport réel est créé sous `evidence/YYYY-MM-DD-<gate>-<slug>.md`. Les rapports peuvent mentionner
une cible de test éphémère si elle est nécessaire à la reproductibilité, mais jamais un secret, une
clé privée, un mot de passe, un token, une adresse privée, un cookie ou une donnée client.

## Rapports disponibles

- [09-08-2026 — Inbox paginée et migration `guided.task.create`](2026-08-09-inbox-summary-and-guided-create-migration.md) :
  résumé minimal, pagination/scopes/révision courante, capacité de création positive/négative ;
  aucune acceptation historique n'est resignée.

- [08-08-2026 — audit de clôture du RAF](2026-08-08-raf-closure-audit.md) : onze exigences
  recroisées, dix actions closes et condition commerciale humaine maintenue bloquante à `0/3`.
- [08-08-2026 — acceptation US-G0-UX-001 sous DER-001](2026-08-08-gate-0-ux-001-der-001.md) :
  rejeu Ghostchrome positif/négatif, absence de tentative/run dans PostgreSQL, captures expurgées
  hors Git, coût réel `0,15 h` et périmètre borné à la seule story UX-001.
- [08-08-2026 — revue adversariale US-G0-UX-001](2026-08-08-gate-0-ux-001-adversarial-review.md) :
  contre-exemples recherchés et limite DER-001 explicite ; aucune indépendance humaine revendiquée.
- [08-08-2026 — inventaire réel des skills Hermes](2026-08-08-g1-skills-real-runtime.md) :
  69 skills observés sur Hermes 0.20.0 via le tunnel SSH vers la VM PVE 210 ; toggle/refus/reviewers
  restent ouverts.
- [08-08-2026 — décomposition du commit `abd52ce`](2026-08-08-abd52ce-traceability.md) :
  rattachement setup/workspace et conversation, aperçu chat hors acceptation, transfert distant
  supprimé, 25 tests ciblés au vert.
- [08-08-2026 — stockage partagé Hermes sur PVE, arbre courant](2026-08-08-gate-1-ssh-storage-current.md) :
  provisioning VM 210 à 100 %, API/Dashboard loopback, manager borné, second passage idempotent et
  round-trip de mission par bind mount sans transfert distant ; VPS historique recontrôlé en lecture.
- [08-08-2026 — durabilité des artefacts sur l'arbre courant](2026-08-08-gate-1-artifact-durability-current.md) :
  remplacement réel du conteneur Compose, volume et SHA-256 conservés, refus corruption/absence et
  nettoyage confirmés ; P-OPS production et reviewer restent ouverts.

- [06-08-2026 — workflow guidé de livraison logicielle](2026-08-06-guided-software-delivery.md) :
  tâche/révisions, approbations séparées, Bubblewrap + Hermes réels, diff, quatre preuves Bun,
  retries idempotents, refus fail-closed, captures desktop/320 px et limites d'acceptation.
- [04-08-2026 — G1-002 Docker et system-wide sur VM](2026-08-04-g1-002-docker-native-pops.md) :
  `READY/0`, digest/commit/checksum figés, séparation admin/service, identités effectives, refus
  sudo/Docker/secrets, loopback, bascule de mode et deuxièmes passages `changed=0`.
- [02-08-2026 — migration du stockage Docker Hermes](2026-08-02-gate-1-ssh-storage-migration.md) :
  cutover réel du volume `/opt/data` vers `/srv/hermes-console/data`, manifestes identiques,
  sauvegarde vérifiable, sondes bind mount/Hermes et rollback automatique réellement déclenché ; reviewer,
  mission avec artefact et sauvegarde externe restent ouverts.
- [02-08-2026 — connectivité Hermes native, Docker locale et Docker VPS](2026-08-02-gate-1-hermes-runtime-connectivity.md) :
  Console en arrière-plan, probes réels `/health` + `/v1/capabilities` et tunnel créé par le module
  SSH du projet ; compte non-root, confinement et acceptation Gate restent ouverts.
- [04-08-2026 — VM SSH vierge Terraform/Ansible](2026-08-04-ssh-003-005-hermes-ephemeral-01.md) :
  SSH-003/004 vérifiées, SSH-005 négatif vérifié et forward Hermes positif restant à rejouer.
- [04-08-2026 — preuve SSH-001/002 sur VM vierge](2026-08-04-ssh-001-002-hermes-ephemeral-01.md) :
  ED25519 concordante hors bande ; RSA/ECDSA encore à confirmer si tous les algorithmes sont requis.
- [04-08-2026 — rotation/révocation SSH-008 sur VM vierge](2026-08-04-ssh-008-hermes-ephemeral-01.md) :
  nouvelle identité fonctionnelle, ancienne clé refusée, ControlMaster fermé et SLA d'environ 315 ms.
- [04-08-2026 — analyse du pin registre Hermes](2026-08-04-g1-002-registry-pin-analysis.md) :
  tags amont en CalVer, digest G1-002C orphelin de tag, candidats épinglables identifiés.
- [04-08-2026 — matrice réelle du candidat v2026.7.20](2026-08-04-g1-002c-v2026.7.20.md) :
  profil upstream compatible, profils Console/root bloqués, promotion refusée.
- [04-08-2026 — revalidation G1-002 sur `latest`/`main`](2026-08-04-g1-002-latest-docker-native.md) :
  Docker et system-wide réels, `READY/0`, identités séparées et deux passages idempotents. Le même
  rapport couvre désormais `US-G1-002D` : rejeu du runtime `~/.hermes` local et update depuis
  `/updates` sur la VM Proxmox 210, avec les deux identifiants d'opération et l'état final restauré.
- [04-08-2026 — rejeu G1-005C](2026-08-04-g1-005c-replay.md) : classification owner/runtime corrigée,
  3 tests pass et 0 échec.
- Gabarit de preuve SSH-001/002 : [`guides/SSH-001-002-EVIDENCE-TEMPLATE.md`](../guides/SSH-001-002-EVIDENCE-TEMPLATE.md)
  (feuille à remplir ; rangée dans `guides/` et non ici, un gabarit vide n'étant pas une preuve).
- [script] `scripts/run-ssh-001-002.sh` (optionnel) :
  exécution semi-automatisée de la preuve `US-G1-SSH-001` / `US-G1-SSH-002`.  
  Sans `EVIDENCE_FILE`, le script écrit dans un rapport horodaté :
  `docs/user-stories/evidence/YYYY-MM-DD-ssh-001-002-<host_alias>.md`.
  Mode accéléré host-key disponible via `SSH_SKIP_TUNNEL_TEST=1` (scan + known_hosts, pas de
  tunnel SSH tant que la vraie identité de service n’est pas disponible).
- [01-08-2026 — RBAC des cinq rôles](2026-08-01-gate-2-rbac.md) : preuve P-INT/P-SEC backend,
  P-E2E et acceptation produit encore ouvertes.
- [01-08-2026 — ownership explicite](2026-08-01-gate-2-ownership.md) : preuve migration,
  ownership requester, transfert atomique, SSE/artefacts et rollback ; P-E2E et acceptation
  produit encore ouvertes.
- [01-08-2026 — séparation MSP/client](2026-08-01-gate-2-msp-client.md) : organisations,
  mandats site/projet, sélection explicite, affectations, audit v2, révocation live et CRUD admin ;
  P-E2E, P-SEC multi-compte et acceptation Gate encore ouverts.
- [31-07-2026 — diagnostic SSH sur VPS existant](2026-07-31-gate-1-ssh-vps-diagnostic.md) :
  preuve partielle, US-G1-008 `BLOQUÉE`.
- [01-08-2026 — export d’audit expurgé](2026-08-01-gate-1-audit-export.md) : préparation code
  locale pour US-G1-005 ; P-SEC/P-E2E et acceptation Gate encore ouvertes.
- [01-08-2026 — policy de cycle de vie et aperçu dry-run](2026-08-01-gate-1-lifecycle-preview.md) :
  slice G1-006A local ; backup/restauration et acceptation Gate encore ouverts.
- [01-08-2026 — export d’audit HTTP/PostgreSQL G1-005B](2026-08-01-gate-1-g1-005b-audit-export.md) :
  P-INT locale sur Hono/PostgreSQL, isolation multi-site, HMAC/trailer et refus fail-closed ;
  revue indépendante, P-SEC/P-E2E, G1-004 et Gate 1 restent ouverts.
- [01-08-2026 — immutabilité PostgreSQL du ledger G1-005C](2026-08-01-gate-1-g1-005c-audit-immutability.md) :
  P-INT locale sur la séparation owner/runtime, refus des altérations directes et neutralisation
  d'un rôle hostile ; propriétaire DB, revue indépendante, P-SEC/P-E2E et Gate 1 restent ouverts.
- [01-08-2026 — export métier vérifié](2026-08-01-gate-1-lifecycle-export.md) : slice G1-006B
  local ; backup/restauration et acceptation Gate encore ouverts.
- [01-08-2026 — vérificateur relationnel de bundle](2026-08-01-gate-1-lifecycle-verifier.md) : slice
  G1-006C implémenté localement ; aucune preuve de backup/restauration réelle.
- [01-08-2026 — restauration business-export scratch](2026-08-01-gate-1-lifecycle-business-export-scratch.md) :
  G1-006D-local restaure un export métier vers PostgreSQL/fichiers scratch et refuse les cibles
  altérées ou occupées ; ce n’est pas un backup disaster-recovery ni une preuve P-OPS.
- [01-08-2026 — backup/restore disaster-recovery local](2026-08-01-gate-1-lifecycle-dr-local.md) :
  G1-006D2-local restaure un dump PostgreSQL et une archive `files-data` vers une cible éphémère,
  vérifie les SHA-256 et refuse les altérations/cibles occupées ; aucune preuve externe P-OPS/P-SEC.
- [01-08-2026 — purge conditionnée locale](2026-08-01-gate-1-lifecycle-purge.md) :
  G1-006E reverifie le preview/policy/legal hold, audite avant effet et purge les rows/fichiers
  bornés ; backup externe, P-OPS/P-SEC et acceptation Gate restent ouverts.
- [01-08-2026 — durabilité Compose des artefacts](2026-08-01-gate-1-artifact-durability-local.md) :
  remplacement réel du conteneur Console, volume `files-data` conservé et refus d’intégrité ;
  même hôte uniquement, P-OPS production et reprise après sinistre encore ouvertes.
- [01-08-2026 — notice IA et garde de consentement](2026-08-01-gate-1-ai-disclosure-local.md) :
  notice versionnée, manifeste de routes, persistance PostgreSQL et refus centralisé `423/428` ;
  P-E2E navigateur et revue clavier/lecteur d’écran encore ouverts.
- [01-08-2026 — manifeste Hermes confiné](2026-08-01-gate-1-hermes-confinement-audit.md) :
  préparation locale G1-002A (overlay digesté, UID non-root, rootfs RO, caps/limites/réseau et
  sondes fixture) ; Hermes réel, P-SEC/P-OPS/P-E2E encore ouverts, story `BLOQUÉE`.
- [01-08-2026 — compatibilité image Hermes réelle](2026-08-01-gate-1-hermes-real-image-confinement.md) :
  G1-002B tire l’image upstream par digest, observe sa version/configuration et refuse de la
  promouvoir lorsque l’overlay ne peut pas la démarrer ; story `BLOQUÉE`.
- [01-08-2026 — matrice candidate Hermes G1-002C](2026-08-01-gate-1-g1-002c-candidate-matrix.md) :
  compare 65532:/work, 10000:/opt/data et bootstrap root ; verdict global non-promu
  `BLOCKED`/`DECISION_REQUIRED`, story G1-002 toujours `BLOQUÉE`.
- [01-08-2026 — enveloppe et enforcer policy](2026-08-01-gate-1-g1-004a-local.md) :
  G1-004A local (tuple Ed25519 stricte, TTL/nonce/payload/portée, consommation anti-rejeu et
  effet synthétique) ; P-SEC/P-E2E et intégration Hermes encore ouvertes, story `BLOQUÉE`.
- [01-08-2026 — claim d’approbation et audit fidèle](2026-08-01-gate-1-g1-004b-approval-claim.md) :
  G1-004B réclame atomiquement une approbation PostgreSQL avec token durable, empêche la double
  réponse Hermes et conserve les résultats distants ambigus ; la policy pré-effet et Gate 1 restent
  ouvertes.
- [01-08-2026 — identité et CAS pré-effet](2026-08-01-gate-1-g1-004c-pre-effect-approval.md) :
  G1-004C-local persiste l’identité Hermes, consomme un claim PostgreSQL single-use et audite
  l’intention avant le relais ; Hermes réel, P-SEC/P-E2E et Gate 1 restent ouverts.
- [01-08-2026 — parcours navigateur notice IA](2026-08-01-gate-1-ai-disclosure-e2e.md) : redirection,
  arbre accessible, clavier et persistance scratch ; lecteur d’écran et acceptation Gate encore ouverts.
- [01-08-2026 — parcours critique post-setup G1-007A](2026-08-01-gate-1-g1-007a-post-setup-local.md) :
  Hono inter-process, PostgreSQL scratch, faux Hermes SSE, approbation/CAS/audit, redémarrage et
  artefact vérifié ; installation vierge, Hermes upstream, P-SEC/P-OPS et acceptation Gate restent ouvertes.
- [01-08-2026 — diagnostic SSH read-only du VPS 187.55.227.55](2026-08-01-gate-1-ssh-vps-18755-diagnostic.md) :
  empreinte ED25519 concordante hors bande stricte, hôte occupé (Swarm, ports 80/443), aucun compte
  ni processus Hermes présent, politique SSH non bornée (`permitopen any`) ; `BLOQUÉE`, pas un
  bootstrap vierge autorisé.
- [01-08-2026 — isolation par site et projet US-G2-001](2026-08-01-gate-2-site-context.md) : contexte
  serveur dérivé de la session, listes limitées au site actif, mêmes refus 404 sans fuite d'existence
  sur identifiant étranger ou aléatoire ; P-E2E navigateur et acceptation Gate 1 restent ouvertes.
- [04-08-2026 — approbation US-G1-004 contre Hermes local](2026-08-04-g1-004-hermes-local-p-e2e.md) :
  refus direct et refus via la policy Console tous deux relayés à un Hermes réel, absence d'effet
  terminal après refus ; ne couvre pas le routeur `respondRunApproval` avec claim PostgreSQL ni la VM 210.
- [04-08-2026 — route Console réelle US-G1-004D en local](2026-08-04-g1-004-real-console-local.md) :
  `bun run proof:g1-004-real` positif et négatif, claim PostgreSQL puis enforcer signé puis Hermes
  réel, `503` sans clés policy, reprise après redémarrage ; rejeu VM 210 et revue P-SEC restent ouverts.
- [04-08-2026 — préflight runtime Hermes déployé US-G1-004](2026-08-04-g1-004-hermes-runtime-preflight.md) :
  `/health` et `/v1/capabilities` répondent sur `hermes-ephemeral-01`, mais le run de recette échoue
  faute de provider d'inférence configuré et n'atteint jamais `waiting_for_approval` ; ne prouve pas
  la policy pré-effet.
- [04-08-2026 — décision de gel US-G1-SSH-001](2026-08-04-ssh-001-gel-decision.md) : gel de
  `US-G1-SSH-001` et de sa chaîne `SSH-002` à `SSH-009` faute d'hôte vierge disponible, critère de
  dégel explicite, correctif embarqué du script de comparaison d'empreinte multi-clés.

## Modèle

~~~markdown
# Preuve — <titre>

- Date/heure UTC :
- Story : US-Gx-nnn
- Commit/build :
- Environnement : local | staging | VPS éphémère
- Opérateur : <identifiant non sensible>
- Reviewer :
- Cible : <alias ou identifiant expurgé>
- Versions Console/Hermes/PostgreSQL/OpenSSH :

## Préconditions

## Scénario positif

- Given :
- When :
- Then attendu :
- Résultat observé :
- Code de sortie/ID de corrélation :

## Scénarios négatifs

### <refus 1>

- Given :
- When :
- Then attendu :
- Résultat observé :
- Absence d'effet vérifiée par :

## Commandes et sorties expurgées

## Inventaire/hash avant et après

## Incidents, écarts et dérogations

## Nettoyage

## Verdict

VÉRIFIÉE | BLOQUÉE | REJETÉE

## Acceptation reviewer

- Nom/identifiant :
- Date :
- Décision : ACCEPTÉE | REFUSÉE
~~~

## Règles spécifiques SSH

Un rapport SSH conserve : algorithme et empreinte publique de l'hôte, empreintes publiques des clés
autorisée/inconnue, méthode de bootstrap, utilisateur non-root, version OpenSSH, codes de sortie,
preuve du tunnel, refus hors workdir, rotation/révocation et nettoyage. Il ne conserve
jamais le contenu d'une clé, même publique, car l'empreinte suffit à la preuve.

## Revue

Le reviewer compare le rapport aux scénarios de la story, vérifie les tests négatifs et contrôle les
références croisées dans [`../TRACEABILITY.md`](../TRACEABILITY.md). Un rapport incomplet reste une
preuve de diagnostic, pas une acceptation.
