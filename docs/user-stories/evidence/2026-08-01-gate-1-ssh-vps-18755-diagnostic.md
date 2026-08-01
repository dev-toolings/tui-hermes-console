# Preuve — Diagnostic SSH read-only du VPS 187.55.227.55

- **Date :** 01-08-2026
- **Story :** US-G1-008
- **Mode :** observations SSH et système en lecture seule
- **Cible :** `root@187.55.227.55`
- **Verdict :** `BLOQUÉE` — preuve de contexte et de transport, pas une acceptation Gate 1

## Portée et garde-fous

La cible fournie a été inspectée sans mutation : aucun compte, service, fichier de configuration,
stack Docker ou workload n'a été créé, supprimé, redémarré ou reconfiguré. Les commandes exécutées
étaient limitées à l'identité, l'OS, les listeners, l'état et l'inventaire Docker, les unités SSH et
la configuration effective `sshd`.

Cette preuve ne contient pas de validation fournisseur hors bande. La correspondance de clé ci-dessous
est une correspondance stricte avec le `known_hosts` local dédié ; elle ne vaut pas preuve d'empreinte
fournisseur ni acceptation de Gate 1.

## Confiance dans l'hôte

La connexion de contrôle a utilisé `BatchMode=yes`, `IdentitiesOnly=yes`,
`StrictHostKeyChecking=yes`, `UpdateHostKeys=no`, `GlobalKnownHostsFile=/dev/null` et un
`UserKnownHostsFile` dédié. OpenSSH a confirmé :

```text
Server host key: ssh-ed25519 SHA256:ef0Sgvvh0+jVXwZ+3/l/FWQc3vQBoxwwxL8hAjHV2nM
Host '187.55.227.55' is known and matches the ED25519 host key.
Authenticated ... using "publickey".
```

L'empreinte ED25519 observée est donc `SHA256:ef0Sgvvh0+jVXwZ+3/l/FWQc3vQBoxwwxL8hAjHV2nM`.
Un avertissement OpenSSH indique que la négociation n'utilise pas encore de mécanisme d'échange de
clés post-quantique ; il est conservé comme dette de durcissement et ne modifie pas la correspondance
de clé classique.

## Environnement observé

- OS : `Debian GNU/Linux 13 (trixie)`.
- Docker Swarm : état local `active`.
- Stacks présentes : `caddy`, `ghostsearch`, `pulsevault`, `qualiopi-audit-tracker`.
- Plusieurs services et conteneurs applicatifs sont actifs, avec notamment les ports publics `80` et
  `443` ; la cible est donc occupée et ne correspond pas à un VPS vierge autorisant notre bootstrap.
- Aucun utilisateur `hermes-console`, aucune unité ou processus Hermes, et aucun conteneur Hermes ou
  Hermes Console n'ont été observés. Aucun endpoint Hermes `127.0.0.1:8642` ne pouvait être qualifié.

## Politique SSH effective

La configuration effective `sshd -T` a retourné :

```text
permitrootlogin yes
permitopen any
forcecommand none
subsystem sftp /usr/lib/openssh/sftp-server
```

Cela signifie que la cible conserve un accès root autorisé, ne borne pas les destinations de forward,
n'impose pas de `ForceCommand` et expose le sous-système SFTP générique. Aucun de ces éléments ne
constitue la frontière SSH attendue pour Hermes Console.

## Résultats par sous-scénario

| ID | Observation sur cette cible | Résultat | Portée |
|---|---|---|---|
| `SSH-001` | VPS déjà occupé par Swarm et applications | non exécuté | bootstrap vierge interdit dans cette passe |
| `SSH-002` | ED25519 strictement correspondante au `known_hosts` local | partiel | pas de preuve fournisseur hors bande |
| `SSH-003` | aucun compte `hermes-console` observé | non exécuté | séparation admin/service absente |
| `SSH-004` | politique `root` encore autorisée ; pas de recette de clé de service | non exécuté | aucune acceptation d'identité dédiée |
| `SSH-005` | `PermitOpen any`, `ForceCommand none` | bloqué | tunnel non borné et Hermes absent |
| `SSH-006` | SFTP générique, aucun workdir Hermes | non exécuté | pas de transfert dans le périmètre cible |
| `SSH-007` | aucun Hermes ni listener `:8642` | non exécuté | tunnel API impossible à comparer |
| `SSH-008` | aucune rotation/révocation exécutée | non exécuté | aucune mutation autorisée |
| `SSH-009` | aucune résilience/concurrence/quota exécutée | non exécuté | hors portée de cette inspection |

## Limites et suite nécessaire

Cette inspection fournit une preuve read-only utile pour le fingerprint strict, l'OS, l'occupation de
la machine et les garde-fous SSH actuellement absents. Elle ne prouve ni le bootstrap fournisseur, ni
un compte de service non-root, ni Hermes, ni `PermitOpen 127.0.0.1:8642`, ni un workdir durable, ni
SFTP applicatif, ni rotation/révocation, ni reprise après coupure.

Le verdict reste `BLOQUÉE`. Une suite acceptable doit utiliser un VPS vierge ou explicitement réinitialisé,
obtenir la preuve d'empreinte hors bande, créer et tester séparément les comptes admin/service, installer
Hermes dans un périmètre autorisé, borner SSH/SFTP, puis rejouer `SSH-001` à `SSH-009` avec preuves
`P-OPS`, `P-SEC`, `P-INT` et `P-E2E`. Ce rapport ne vaut ni preuve OOB ni acceptation Gate 1.
