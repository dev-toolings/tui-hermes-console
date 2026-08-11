# Preuve locale — US-G1-002B — image Hermes réelle

- **Date :** 01-08-2026
- **Image AMD64 :** `nousresearch/hermes-agent@sha256:ba2e68e36141df80066ac88a7d446f39246a38b1aeb849d972a0ba77d35fe442`
- **Commande :** `HERMES_REAL_IMAGE=<digest> bun run proof:g1-002b`
- **Verdict :** `BLOCKED` — incompatibilité explicite, aucune promotion

## Observations

Le binaire upstream répond `Hermes Agent v0.19.1 (2026.7.30)`, alors que le PRD fixe encore
`v0.19.0`. La configuration OCI observée est `User=root`, `Entrypoint=[/init,
/opt/hermes/docker/main-wrapper.sh]`, `WorkingDir=/opt/hermes` et un volume `/opt/data`.

La reprise du contrat Overlay Console actuel échoue avant le démarrage de Hermes avec l’utilisateur
`65532:65532`, `cap_drop: ALL`, `no-new-privileges` et `/run` monté en tmpfs mode `0755`, non
inscriptible par cet UID : le superviseur s6 refuse un `/run` appartenant à root et ne peut pas
corriger les permissions sans privilège. Les
sondes séparées de sandbox réelle ont toutefois confirmé l’écriture autorisée dans `/work`, le refus
d’écriture du rootfs, et la non-visibilité du socket Docker, du chemin hôte et du secret d’un autre
workflow ; le marqueur `/opt/data` survit à un remplacement de conteneur.

## Conclusion

G1-002B prouve maintenant que la fixture précédente ne suffisait pas et empêche une fausse preuve
verte contre l’image upstream. Elle ne clôt pas US-G1-002 : il faut une décision sur la version,
une image dérivée ou un contrat d’identité/workdir approuvé, puis P-SEC/P-OPS/P-E2E indépendantes.

G2-005 et G2-006 n’ont pas été modifiées.
