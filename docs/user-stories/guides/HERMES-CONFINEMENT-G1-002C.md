# Guide de recette — G1-002C, matrice candidate Hermes

G1-002C prépare une décision d’image, d’identité et de workdir sans modifier le contrat de
production. Un profil techniquement vert ne devient jamais une promotion automatique.

╔══════════════════════╗   profils Docker   ╔══════════════════════╗
║ image@sha256 digest  ║ ─────────────────▶ ║ harness G1-002C      ║
╚══════════════════════╝                    ╚══════════╤═══════════╝
                                                       │ observations
                                                       ▼
                                             ┌────────────────────┐
                                             │ BLOCKED / DECISION │
                                             └────────────────────┘

Légende : le harness compare les profils et conserve un verdict non-promu.

## Exécution

    HERMES_REAL_IMAGE='nousresearch/hermes-agent@sha256:<digest-amd64>' bun run proof:g1-002c

Le digest doit être local ou explicitement tiré avec HERMES_REAL_PULL=1. Docker est obligatoire ;
une absence de Docker fait échouer la preuve, elle ne la skippe pas.

## Profils comparés

- contrat Console : UID 65532, workdir /work, rootfs read-only, caps supprimées ;
- upstream Hermes : UID 10000, home/workdir /opt/data ;
- bootstrap root : observation du superviseur root, sans valeur d’acceptation de confinement.

Chaque profil sonde version, écriture dans la cible, refus rootfs/socket/secret étranger et
persistance d’un marqueur dans un volume temporaire préfixé. Les volumes sont toujours supprimés.

## Règle de décision

La sortie JSON distingue probePassed, versionMatchesExpected, promotionAllowed et
decisionApproved=false. Le verdict global est toujours BLOCKED ou DECISION_REQUIRED et le
processus sort avec un code non nul : aucune décision produit n’est simulée. Le harness ne modifie
aucun fichier à l’exécution ; la référence/version/contrat de production du PRD reste inchangée.

Cette matrice ne constitue ni P-SEC, ni P-OPS, ni P-E2E, ni une acceptation de US-G1-002 ou Gate 1.
