# Preuve — US-G1-002 / US-G1-002D — canaux `latest`/`main` et update depuis la Console

- **Date :** 04-08-2026
- **Cible :** VM Proxmox `hermes-ephemeral-01`, VMID `210`, `2 vCPU`, `8 Gio RAM`, disque `20 Gio`
- **Provisionnement :** Terraform/pvecli pour la VM, Ansible pour le guest
- **Identités :** admin `hermes-admin`, service non privilégié `hermes-console` (`1002:1003`)
- **Clé d’hôte :** vérification stricte via `~/.ssh/hermes-ephemeral-01.known_hosts` ; les trois
  empreintes observées concordent avec la preuve SSH-001/002 existante.

## Contrat rejoué

Le déploiement ne reçoit plus de tag, digest ou commit Hermes fixe :

- Docker tire `nousresearch/hermes-agent:latest`, résout le digest puis exécute ce digest ;
- system-wide résout `refs/heads/main`, exécute l’installateur officiel avec `--branch main` et sans
  `--commit`, puis installe directement dans un chemin nommé avec le commit observé ;
- le digest Docker, le commit Git et le SHA-256 de l’installateur sont des preuves de sortie et des
  cibles de rollback, pas des pins d’entrée.

## Docker réel

- Canal : `nousresearch/hermes-agent:latest`
- Digest résolu :
  `nousresearch/hermes-agent@sha256:fab1487c3158721ce2301ff6f098718742b2d47bdaa02e05ae406d2fdbdf3ecc`
- Révision OCI observée : `f5be9236e00ddf2f2a412697f267078fc4ee068e`
- Version applicative : `0.20.0` (`2026.8.3`)
- Healthcheck : `HTTP 200`
- Identité de données : `1002:1003`
- Publication : `127.0.0.1:8642`
- Confinement effectif : `cap_drop=ALL`, cinq capabilities bootstrap, `no-new-privileges`, limite
  `1.5 CPU`, `6 Gio`, `256 PID`, bind mount `/opt/data`.
- Premier passage : `failed=0`, remplacement de l’ancien conteneur pinné sans suppression du bind
  mount.
- Second passage : `changed=0`, `failed=0`.

## System-wide réel

- Branche suivie : `main`
- Commit observé : `f5be9236e00ddf2f2a412697f267078fc4ee068e`
- SHA-256 observé de l’installateur :
  `45f589461248c7a6ec3aecd7522a69dd49c5c8dbf4798ba1296af5c0c5e7ccd3`
- Option `--commit` : absente du playbook et du contrat d’exécution.
- Installation finale : `/opt/hermes-console/releases/f5be9236e00ddf2f2a412697f267078fc4ee068e`
- Healthcheck : `HTTP 200`
- Processus : utilisateur et groupe `hermes-console`, écoute `127.0.0.1:8642`.
- Second passage : `changed=0`, `failed=0`.

Deux défauts ont été détectés pendant le rejeu puis corrigés avant la preuve verte : l’escalade
Ansible directe vers un utilisateur non privilégié sur Debian et le déplacement d’un venv après sa
création. La recette utilise désormais `runuser` et installe directement dans le chemin final.

## Rejeu réel de l'update depuis `/updates`

Le déploiement de référence ci-dessus et le rejeu fonctionnel ci-dessous sont deux observations du
canal mutable `latest`/`main`. Une révision ou un digest observé peut donc différer entre deux
passages ; il n'est jamais injecté comme pin d'entrée.

### Local `~/.hermes`

- Installation réellement présente : `~/.hermes`.
- Probe directe après mise à niveau : version `0.20.0`, `/health` sain.
- Le chemin local reste le chemin natif existant ; il ne passe pas par le manager root distant.

### VM Proxmox 210 — system-wide

- Précondition de rejeu : retour temporaire à une release native Hermes `0.19.0`.
- Action : ouverture de `/updates`, clic sur `Lancer la mise à jour`, attente de l'état final
  `Hermes est à jour`.
- Opération corrélable : `upd_864b756e17f543568ea12a4f8b46d439`.
- Résultat : `main` résolu vers `b3e45a3d46ce1af52a267cc3aaa3cb6c4f52d1e8`, health HTTP `200`,
  version applicative `0.20.0`.

### VM Proxmox 210 — Docker

- Précondition de rejeu : retour temporaire à l'image Hermes `0.19.0` observée dans la preuve
  candidate historique.
- Action : même parcours `/updates`, avec le runtime Docker sélectionné.
- Opération corrélable : `upd_27fd015e9a7c4b98a4f449c93a03e9b9`.
- Résultat : `latest` résolu vers
  `nousresearch/hermes-agent@sha256:b934476e685a7a11c2d02f6152c9fc1eb5351023136793090913ede37f0c2a1a`,
  health HTTP `200`, version applicative `0.20.0`.

## État final et contrôles de privilèges

- Le runtime final actif sur la VM est system-wide Hermes `0.20.0` ; le conteneur Docker est arrêté
  conformément à l'exclusivité des deux modes.
- Le compte `hermes-console` n'obtient ni sudo général ni accès Docker ; `sudo -n true` et `docker
  info` échouent depuis ce compte, tandis que l'inspection du manager borné réussit.
- Le manager local et le manager installé sur la VM ont le même SHA-256 :
  `9b48dd9f29e21f8b522e9a6950d089750cda47bdb6542e7c9970fac2dbf4be15`.
- Aucun conteneur temporaire ni ressource de rollback abandonnée n'est resté actif après le rejeu.

## Validation technique associée

| Contrôle | Résultat |
|---|---|
| Tests ciblés manager/provisioning | `11` tests, `56` expect, `0` échec |
| Régression | `600` tests passés, `3` skips explicites, `0` échec |
| Shell manager | `sh -n` vert |
| Ansible | syntaxe des deux playbooks verte |
| Compilation sidecar | binaire compilé et chaîne manager embarquée présente |
| G1-005C | `3/3` tests passés |

Ces contrôles prouvent l'implémentation et la recette technique. Ils ne valent pas la signature d'un
reviewer indépendant ni l'acceptation P-E2E de Gate 1.

## Matrice et négatifs

La matrice G1-002C rejouée sur le digest résolu retourne `READY/0` :

- `target-contract` `1002:1003` : probes version, sandbox et persistance verts ;
- `production-reference` `10000:10000` : probes verts ;
- sélection déclarée `LATEST-2026-08-04` : digest et version concordants ;
- `root-bootstrap` reste rouge à cause du tmpfs `/run` trop restrictif dans ce profil diagnostique ;
  il est explicitement exclu de qualification et n’altère pas `READY/0`.

Sous le compte service réel : `/health` retourne `status=ok`, `sudo -n true` retourne `1` et
`docker ps` retourne `1`. Le compte appartient uniquement à `hermes-console` et `hermes-work`.

## Verdict

Le contrat technique Docker + system-wide suivant `latest`/`main` et le parcours d'update de
`US-G1-002D` sont **verts et idempotents** sur la VM de preuve ; le runtime local `~/.hermes` est
également sain. US-G1-002 et US-G1-002D restent `IMPLÉMENTÉES` au sens normatif tant que la revue
indépendante et le parcours P-E2E de Gate 1 ne sont pas signés ; cette preuve ne les simule pas.
