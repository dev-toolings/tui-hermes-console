# Preuve — US-G1-002 — analyse du pin registre Hermes

- **Date :** 04-08-2026
- **Story :** `US-G1-002` (§9.5 — Hermes pinné et confiné)
- **Type de preuve :** `P-CODE` (interrogation registre read-only, aucune mutation, aucun pull)
- **Portée :** attribution du digest épinglé par
  [G1-002C](2026-08-01-gate-1-g1-002c-candidate-matrix.md) et identification des candidats réels
- **Verdict :** le pin fonctionne mais n'est rattachable à aucune version publiée

## Méthode

Interrogation anonyme du Docker Hub Registry v2 sur `nousresearch/hermes-agent`, sans `docker pull`
et sans écriture. Les 21 tags publiés ont été résolus, index et manifestes enfants inclus.

```sh
TOKEN=$(curl -fsS "https://auth.docker.io/token?service=registry.docker.io&scope=repository:nousresearch/hermes-agent:pull" \
  | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
curl -fsS -H "Authorization: Bearer $TOKEN" \
  "https://registry-1.docker.io/v2/nousresearch/hermes-agent/tags/list"
```

## Fait 1 — le versionnage amont est CalVer, pas SemVer

Les 21 tags publiés sont : `latest`, `main`, `v2026.4.3`, `v2026.4.8`, `v2026.4.13`, `v2026.4.16`,
`v2026.4.23`, `v2026.4.30`, `v2026.5.7`, `v2026.5.16`, `v2026.5.28`, `v2026.5.29`, `v2026.5.29.2`,
`v2026.6.5`, `v2026.6.19`, `v2026.7.1`, `v2026.7.7`, `v2026.7.7.2`, `v2026.7.20`, `v2026.7.30`,
`v2026.8.3`.

Aucun tag `v0.19.0` ni `v0.19.1` n'existe et n'a jamais pu exister. Le `0.19.x` du PRD est la version
**applicative** renvoyée par `/health`, pas une référence d'image. La correspondance est déjà établie
ailleurs dans le repo :

| Version applicative | Tag registre | Source dans le repo |
|---|---|---|
| `0.19.0` | `v2026.7.20` | `docs/SPIKE-REPORT.md:4` — « Hermes Agent v0.19.0 (2026.7.20) » |
| `0.19.1` | `v2026.7.30` | `evidence/2026-08-01-gate-1-hermes-real-image-confinement.md:10` — « v0.19.1 (2026.7.30) » |

**Conséquence :** l'écart « `v0.19.1` observé ≠ `v0.19.0` attendu » qui bloque `US-G1-002` n'appelle
pas nécessairement une révision du PRD. Le build qui répond `0.19.0` est toujours publié et
épinglable.

## Fait 2 — le digest épinglé par G1-002C n'appartient à aucun tag

`sha256:ba2e68e36141df80066ac88a7d446f39246a38b1aeb849d972a0ba77d35fe442` a été comparé aux digests
d'index **et** aux digests de manifestes enfants des 21 tags. Aucune correspondance.

Il reste néanmoins résolvable : `GET /v2/.../manifests/sha256:ba2e68e3...` renvoie `HTTP 200` avec un
manifeste OCI valide. Son blob de config donne :

```text
created  : 2026-08-01T16:54:40Z
User     : root
WorkingDir: /opt/hermes
Entrypoint: ["/init", "/opt/hermes/docker/main-wrapper.sh"]
Volumes  : {"/opt/data": {}}
Labels   : org.opencontainers.image.revision = d5e135a51353c2dbc489d5c2583158b22d8efd7b
```

La configuration OCI concorde exactement avec celle décrite par G1-002C, ce qui confirme qu'il s'agit
bien de l'image évaluée. Sa date de création est le jour même de la preuve, et `v2026.8.3` est sorti
depuis : le pin a très probablement capturé un `latest`/`main` transitoire, depuis déplacé.

**Conséquence :** le pin est techniquement stable, mais orphelin. Aucune version publiée ne lui
correspond, aucun label ne porte de version applicative, et un ramasse-miettes de registre le rend
supprimable sans préavis. « Image épinglée » est vrai ; « version connue et reproductible » est faux.
C'est insuffisant pour une exigence de supply chain.

## Fait 3 — le profil « Console 65532:/work » est incompatible par construction

Le blob de config montre que l'image impose son propre contrat de persistance :

```text
HERMES_HOME=/opt/data
HERMES_WRITE_SAFE_ROOT=/opt/data
User=root   WorkingDir=/opt/hermes   Volume=/opt/data
```

Le profil `65532:/work` évalué par G1-002C contredit ces trois valeurs simultanément. Son échec
« permission/persistance incompatibles » n'est donc pas un défaut de réglage : aucun paramétrage de
`docker run` ne le corrigera sur cette image. Obtenir un non-root sur `/work` exige une image dérivée
maintenue par nos soins.

## Candidats épinglables (état au 04-08-2026)

| Tag | Digest d'index | Manifeste `linux/amd64` |
|---|---|---|
| `v2026.7.20` (applicatif `0.19.0`) | `sha256:f7b35053268f532f98955195c909f15a230470fbcbdacaa9fdecb95707dad04a` | `sha256:a6ce64e2038867885c2c90f6602425e6e70293d5e6d952a0e603a99265e01c40` |
| `v2026.7.30` (applicatif `0.19.1`) | `sha256:b869e64d6496d4763d5e4fb675b5f504cb23b0e35ec9b790481a56118602b10f` | `sha256:5316c2c2534c49f5e1b1691e1a2115f1230d900033c3b35d1c8fc2e47352b26d` |
| `v2026.8.3` (dernier publié) | `sha256:16788311e2fa3035456bdc1bafb8ec2b1777db64ebf020af9bb7eb73c3712c9e` | non résolu, hors périmètre |

Ces digests d'index sont content-addressed et donc stables tant que le tag n'est pas supprimé.

## Ce que cette preuve n'établit pas

- Aucune image n'a été pullée ni exécutée. La version applicative des candidats n'est pas
  re-vérifiée ici ; elle est reprise des preuves antérieures du repo.
- Aucune décision de promotion n'est prise. `US-G1-002` reste `BLOQUÉE`.
- `promotionAllowed` reste `false` ; le harness G1-002C n'a pas été rejoué.

## Décision requise du propriétaire produit

1. **Épingler `v2026.7.20`** et conserver le PRD tel quel, puisque ce build répond `0.19.0`.
2. **Épingler `v2026.8.3`** et amender le PRD, en assumant un saut de version et le rejeu des
   preuves de confinement.
3. **Conserver `ba2e68e3...`** : déconseillé, orphelin de tag et non attribuable à une version.

Dans les trois cas, le profil retenu ne peut être que `10000:/opt/data`, sauf à décider de construire
et maintenir une image dérivée.
