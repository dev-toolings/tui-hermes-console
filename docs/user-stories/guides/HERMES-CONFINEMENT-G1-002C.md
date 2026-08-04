# Guide de recette — G1-002C, matrice candidate Hermes

G1-002C classe une image digestée à partir de son comportement effectif. La configuration OCI est
restituée comme diagnostic, mais seuls les statuts des probes, la version et les UID/GID/workdir
effectivement observés peuvent bloquer un profil. Le harness ne déploie rien et ne modifie aucun pin.

╔════════════════════════════ Matrice Docker locale ═════════════════════════════╗
║ ┌──────────────────────┐ runtime et version ┌───────────────────────────────┐ ║
║ │ production-reference ├───────────────────▶│ qualification et sélection   │ ║
║ └──────────────────────┘                    └───────────────────────────────┘ ║
║ ┌──────────────────────┐ promotion et runtime ┌─────────────────────────────┐ ║
║ │ target-contract      ├─────────────────────▶│ déployabilité et verdict    │ ║
║ └──────────────────────┘                      └─────────────────────────────┘ ║
║ ┌──────────────────────┐ observation seule  ┌──────────────────────────────┐ ║
║ │ root-bootstrap       ├───────────────────▶│ diagnostic JSON              │ ║
║ └──────────────────────┘                    └──────────────────────────────┘ ║
╚════════════════════════════════════════════════════════════════════════════════╝

Légende : chaque flèche indique la nature de l’observation transmise. Composants : trois profils
Docker temporaires, sélection opérateur déclarée par environnement et automate de sortie JSON.

## Canal produit courant

Le provisioning suit le canal Docker officiel `nousresearch/hermes-agent:latest` et la branche native
`main`. Avant la matrice, l’opérateur résout le digest de `latest` et observe la version applicative ;
ces deux valeurs alimentent la recette sans devenir des pins permanents. Le déploiement conserve le
digest ou commit effectivement obtenu pour l’audit et le rollback. Les preuves du pin précédent
restent des preuves historiques et ne décrivent plus le contrat courant.

## Exécution locale sans pull

    HERMES_REAL_IMAGE='nousresearch/hermes-agent@sha256:<digest-amd64>' \
    HERMES_REAL_PULL=0 \
    bun run proof:g1-002c

`HERMES_EXPECTED_VERSION` doit correspondre à la version observée sur le digest résolu. Le digest doit
déjà être présent dans le cache Docker avec `HERMES_REAL_PULL=0`. L’absence de Docker ou de l’image
produit `BLOCKED/1`, jamais un skip.

## Profils et classification

- `production-reference` est fixe : UID/GID `10000:10000`, workdir et cible writable `/opt/data`.
  Son probe runtime et sa version contrôlent `qualificationPassed`.
- `target-contract` vaut par défaut UID/GID `65532:65532`, workdir `/work`, cible writable `/work`.
  Il est configurable avec `HERMES_TARGET_UID`, `HERMES_TARGET_GID`,
  `HERMES_TARGET_WORKDIR` et `HERMES_TARGET_WRITABLE_PATH`. UID et GID sont fournis ensemble et sont
  des entiers strictement positifs. Les chemins sont absolus et sans segment parent.
- `root-bootstrap` observe le démarrage root. Ses résultats alimentent uniquement les profils et
  `allProfilesPassed`; ils sont exclus de qualification, promotion, déployabilité et verdict final.

Le sandbox est créé comme conteneur temporaire nommé. Avant son démarrage, le harness lit
`.Config.User` et `.Config.WorkingDir` avec `docker inspect`, puis exécute le probe avec
`docker start --attach` et supprime le conteneur en `finally`. UID, GID et workdir effectifs proviennent
uniquement de cette observation daemon contrôlée par l’hôte ; le stdout candidat reste diagnostique et
ne peut jamais fournir ces valeurs.

La fonction pure `classifyCandidateProbe` accumule toutes les failures avant de calculer
`probePassed` : statuts version/sandbox/inspection/persistance, nettoyages, version attendue, identité
daemon numérique `UID:GID` et workdir daemon. La configuration OCI de l’image reste restituée avec ses
indicateurs de correspondance, mais demeure strictement diagnostique.

La matrice doit contenir exactement un résultat `target-contract`, un `production-reference` et un
`root-bootstrap`. Toute absence ou duplication produit `INVALID_INPUT/64`. `allProfilesPassed` reste
diagnostique seulement.

## Sélection opérateur déclarative

Les trois variables sont soit toutes absentes, soit toutes présentes :

    HERMES_OPERATOR_SELECTED_DIGEST='sha256:<64 caractères hexadécimaux>'
    HERMES_OPERATOR_SELECTED_VERSION='<version-observée>'
    HERMES_OPERATOR_SELECTION_REF='LATEST-RESOLVED-REFERENCE'

La référence est trimée, mesure de 3 à 128 caractères et respecte
`^[A-Za-z0-9][A-Za-z0-9._:/-]*$`. Une assertion partielle ou malformée produit `INVALID_INPUT/64`.
Une assertion complète mais différente du digest ou de la version candidate produit
`ASSERTION_MISMATCH/2`.

Le JSON restitue honnêtement :

    "operatorSelection": {
      "source": "environment",
      "digest": "sha256:...",
      "version": "<version-observée>",
      "reference": "LATEST-RESOLVED-REFERENCE",
      "matched": true,
      "authenticated": false
    }

`authenticated=false` est invariant : ce harness ne prétend pas disposer d’un backend d’identité ou
d’approbation.

## Automate et codes de sortie

| Verdict | Code | Condition |
|---|---:|---|
| `BLOCKED` | `1` | `production-reference` échoue son runtime ou la version attendue |
| `DECISION_REQUIRED` | `2` | qualification réussie, aucune sélection opérateur fournie |
| `ASSERTION_MISMATCH` | `2` | sélection valide mais digest ou version différents du candidat |
| `SELECTED_NOT_DEPLOYABLE` | `3` | sélection correspondante, mais `target-contract` rouge |
| `READY` | `0` | promotion autorisée et target déployable |
| `INVALID_INPUT` | `64` | entrée invalide ou cardinalité des profils incorrecte |

Les invariants sont :

- `qualificationPassed = production-reference.probePassed && production-reference.versionMatchesExpected` ;
- `promotionAllowed = qualificationPassed && operatorSelection.matched` ;
- `deploymentAllowed = promotionAllowed && target-contract.probePassed` ;
- code `0` si et seulement si `promotionAllowed && deploymentAllowed`.

Même `READY/0` ne déclenche aucun déploiement, changement Compose, pin ou provisioning. Cette matrice
ne constitue ni P-SEC, ni P-OPS, ni P-E2E, ni une acceptation de `US-G1-002` ou Gate 1.
