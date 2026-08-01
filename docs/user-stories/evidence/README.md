# Rapports de preuve

Un rapport réel est créé sous `evidence/YYYY-MM-DD-<gate>-<slug>.md`. Les rapports peuvent mentionner
une cible de test éphémère si elle est nécessaire à la reproductibilité, mais jamais un secret, une
clé privée, un mot de passe, un token, une adresse privée, un cookie ou une donnée client.

## Rapports disponibles

- [01-08-2026 — RBAC des cinq rôles](2026-08-01-gate-2-rbac.md) : preuve P-INT/P-SEC backend,
  P-E2E et acceptation produit encore ouvertes.
- [01-08-2026 — ownership explicite](2026-08-01-gate-2-ownership.md) : preuve migration,
  ownership requester, transfert atomique, SSE/artefacts et rollback ; P-E2E et acceptation
  produit encore ouvertes.
- [01-08-2026 — séparation MSP/client](2026-08-01-gate-2-msp-client.md) : organisations,
  mandats site/projet, sélection explicite, affectations, audit v2, révocation live et CRUD admin ;
  P-E2E, P-SEC multi-compte et acceptation Gate encore ouverts.
- [31-07-2026 — diagnostic SSH/SFTP sur VPS existant](2026-07-31-gate-1-ssh-vps-diagnostic.md) :
  preuve partielle, US-G1-008 `BLOQUÉE`.
- [01-08-2026 — export d’audit expurgé](2026-08-01-gate-1-audit-export.md) : préparation code
  locale pour US-G1-005 ; P-SEC/P-E2E et acceptation Gate encore ouvertes.
- [01-08-2026 — policy de cycle de vie et aperçu dry-run](2026-08-01-gate-1-lifecycle-preview.md) :
  slice G1-006A local ; backup/restauration et acceptation Gate encore ouverts.
- [01-08-2026 — export d’audit HTTP/PostgreSQL G1-005B](2026-08-01-gate-1-g1-005b-audit-export.md) :
  P-INT locale sur Hono/PostgreSQL, isolation multi-site, HMAC/trailer et refus fail-closed ;
  revue indépendante, P-SEC/P-E2E, G1-004 et Gate 1 restent ouverts.
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
- [01-08-2026 — garde SFTP locale](2026-08-01-gate-1-ssh-sftp-006a-local.md) : US-G1-SSH-006A
  borne les chemins distants avant les appels SFTP ; aucune preuve de frontière OS/VPS.
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
preuve du tunnel, hash SFTP, refus hors workdir, rotation/révocation et nettoyage. Il ne conserve
jamais le contenu d'une clé, même publique, car l'empreinte suffit à la preuve.

## Revue

Le reviewer compare le rapport aux scénarios de la story, vérifie les tests négatifs et contrôle les
références croisées dans [`../TRACEABILITY.md`](../TRACEABILITY.md). Un rapport incomplet reste une
preuve de diagnostic, pas une acceptation.
