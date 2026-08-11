# Preuve locale — G1-002C — matrice candidate Hermes

- Date : 01-08-2026
- Story : G1-002C-candidate, sous-slice préparatoire de US-G1-002
- Image : nousresearch/hermes-agent@sha256:ba2e68e36141df80066ac88a7d446f39246a38b1aeb849d972a0ba77d35fe442
- Commande : HERMES_REAL_IMAGE=<digest> bun run proof:g1-002c
- Résultat : JSON émis, sortie non nulle, verdict global BLOCKED

## Observations

| Profil | Résultat |
|---|---|
| Console 65532:/work | bloqué : permission/persistance incompatibles, UID effectif 65532 ; sandbox négative passée |
| upstream 10000:/opt/data | sondes techniques passées, UID effectif 10000, version observée v0.19.1 ≠ PRD v0.19.0 ; candidat non promu |
| root bootstrap | entrypoint OCI /init observé, UID effectif 0, sortie 126 et permission denied ; observation seulement |

La configuration OCI observée reste User=root, WorkingDir=/opt/hermes, entrypoint s6 et volume
/opt/data. Le profil upstream techniquement vert ne correspond pas à la version PRD v0.19.0 et ne
vaut pas acceptation.

## Garanties de non-promotion

- verdict distingue probePassed et promotionAllowed ;
- promotionAllowed reste false et le code de sortie reste non nul ;
- aucune référence/version/contrat de production du PRD n’est révisé ; le harness ne modifie
  aucun fichier à l’exécution ;
- volumes temporaires G1-002C supprimés ;
- P-SEC/P-OPS/P-E2E et Gate 1 restent ouvertes.

US-G1-002 reste BLOQUÉE jusqu’à une décision explicite sur version, image, identité effective et
workdir, puis une revue indépendante. G2-005 et G2-006 n’ont pas été modifiées.
