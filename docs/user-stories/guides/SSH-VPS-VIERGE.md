# Guide normatif — Enrôler un VPS vierge par SSH

Ce guide couvre le cas où aucune clé de l'opérateur n'est encore autorisée. Il privilégie une clé
publique, un utilisateur non-root et une empreinte d'hôte vérifiée. Les noms entre `<...>` sont des
variables à remplacer localement ; ils ne doivent pas être copiés tels quels.

Il complète US-G1-008. Il ne donne pas à Hermes un accès root et ne transforme pas SSH en mécanisme
fleet permanent.

~~~text
╔══════════════════════╗
║ Console fournisseur  ║
║ password · recovery  ║
╚══════════╤═══════════╝
           │ bootstrap unique · clé publique
           ▼
┌──────────────────────┐
│ Compte non-root VPS  │
│ authorized_keys      │
└──────────╤───────────┘
           │ SSH clé + empreinte connue · tunnel
           ▼
╔══════════════════════╗
║ Serveur Console      ║
║ ssh-agent/config     ║
╚══════════╤═══════════╝
           │ TCP local forward · API 8642
           ▼
┌──────────────────────┐
│ Hermes loopback      │
│ workdir autorisé     │
└──────────────────────┘
~~~

Légende : la console fournisseur sert uniquement au bootstrap ; SSH authentifie la clé cliente et
l'empreinte du serveur ; le tunnel expose localement l'API Hermes distante. Composants : console de
secours, compte dédié, hôte Console, Hermes.


> Le transfert de fichiers distant et ses stories `US-G1-SSH-006/007/009` ont été retirés le
> 08-08-2026. Le répertoire de travail est partagé par bind mount, voir `US-G1-SSH-010`. La clé SSH
> doit toujours autoriser le port-forwarding, dont dépend le tunnel Hermes.

## Parcours de livraison et sous-scénarios stables

L'ordre ci-dessous est bloquant : un échec arrête la livraison avant la phase suivante.

| Ordre | ID | Contrat testable | Sortie obligatoire |
|---|---|---|---|
| 1 | `SSH-001` | Bootstrap d'un VPS sans notre clé via fournisseur/password/recovery | clé publique installée sans exposer la clé privée |
| 2 | `SSH-002` | Vérification hors bande de l'empreinte d'hôte | `known_hosts` dédié et correspondance exacte |
| 3 | `SSH-003` | Connexion par clé au compte non-root | deux connexions batch réussies, `id` non-root |
| 4 | `SSH-004` | Refus d'une clé cliente inconnue/révoquée | exit non nul, aucun effet ni fallback password |
| 5 | `SSH-005` | Refus d'une empreinte inconnue/modifiée | échec avant authentification |
| 7 | `SSH-007` | Tunnel vers Hermes loopback | capabilities identiques, port fermé après arrêt |
| 8 | `SSH-008` | Rotation puis révocation de clé | nouvelle clé seule autorisée, sessions anciennes closes |
| 9 | `SSH-009` | Reconnexion, concurrence, coupure et quota | pas de fuite, mélange, fichier partiel ou faux succès |

Une preuve partielle peut fermer un sous-scénario, mais US-G1-008 reste `BLOQUÉE` tant que les neuf
sous-scénarios ne sont pas vérifiés sur la topologie cible. Le rapport de référence du 31-07-2026
n'a couvert qu'une partie de `SSH-002`, `SSH-004`, `SSH-005` et `SSH-006` ; il n'a pas validé un
Hermes distant.

## 1. Préparer la clé côté Console

La clé privée DOIT rester sur la machine qui exécute le serveur Hermes Console ou dans son agent SSH.
Elle NE DOIT PAS entrer dans PostgreSQL, Git, une capture ou une commande distante.

Lister les clés publiques existantes :

~~~sh
find "$HOME/.ssh" -maxdepth 1 -type f -name '*.pub' -print
ssh-keygen -lf "$HOME/.ssh/<console_key>.pub"
~~~

Si une clé dédiée est nécessaire :

~~~sh
ssh-keygen -t ed25519 -a 64 -f "$HOME/.ssh/<console_key>" -C "hermes-console:<site>:<yyyy-mm>"
chmod 600 "$HOME/.ssh/<console_key>"
chmod 644 "$HOME/.ssh/<console_key>.pub"
~~~

Protéger la clé privée par passphrase et la charger dans `ssh-agent`. Pour un service non interactif,
utiliser le coffre/agent du système plutôt qu'une clé sans protection copiée dans le dépôt.

## 2. Obtenir le premier accès sans notre clé

Choisir une seule voie, selon les capacités du fournisseur :

1. **Console série/KVM fournisseur** : se connecter avec le credential initial ou réinitialisé dans
   l'interface du fournisseur. Ne jamais passer ce mot de passe dans une commande ou ce rapport.
2. **Injection de clé/cloud-init du fournisseur** : injecter le contenu du fichier `.pub`, jamais la
   clé privée, lors de la création/reconstruction du VPS.
3. **Mode rescue/recovery** : suivre la documentation du fournisseur pour démarrer l'image de secours,
   identifier puis monter explicitement la partition racine. Ne jamais deviner le device. Entrer dans
   le système monté avec `chroot` seulement après avoir vérifié le volume, puis appliquer les étapes
   de création de compte ci-dessous.
4. **Mot de passe SSH temporaire imposé par le fournisseur** : relever d'abord l'empreinte d'hôte via
   la console ou les métadonnées authentifiées du fournisseur, puis saisir le mot de passe dans le
   prompt interactif de `ssh`. Ne pas employer `sshpass`, une URL, une variable d'environnement ou un
   argument de commande. Installer la clé publique, la tester, puis désactiver ce chemin à l'étape 6.

Le premier accès root est un bootstrap temporaire. Garder la console fournisseur ouverte jusqu'à ce
que deux connexions par clé aux comptes admin et de service aient réussi.

## 3. Créer les comptes non-root et installer les clés publiques

Depuis la console fournisseur ou le shell root temporaire :

### 3.1 Conserver un chemin d'administration/recovery

Créer d'abord un compte d'administration distinct `<admin-user>` avec sa propre clé. Lui donner le
mécanisme d'élévation prévu par la distribution et le tester ; ne pas réutiliser le compte de service
Hermes pour administrer l'hôte. Exemple Debian, à adapter après inspection de la distribution :

~~~sh
adduser --disabled-password --gecos '' <admin-user>
usermod -aG sudo <admin-user>
install -d -m 0700 -o <admin-user> -g <admin-user> /home/<admin-user>/.ssh
install -m 0600 -o <admin-user> -g <admin-user> /dev/null /home/<admin-user>/.ssh/authorized_keys
~~~

Installer la clé publique d'administration via la console fournisseur. Configurer ensuite une
élévation non interactive selon la politique de l'organisation, ou un mot de passe d'administration
fort conservé hors Git. Avant tout durcissement, deux nouvelles connexions DOIVENT réussir et
`sudo -n true` DOIT réussir si le mode non interactif a été retenu. Garder en plus la console
fournisseur/recovery disponible et testée.

### 3.2 Créer le compte de service Console

~~~sh
adduser --disabled-password --gecos '' hermes-console
install -d -m 0700 -o hermes-console -g hermes-console /home/hermes-console/.ssh
install -m 0600 -o hermes-console -g hermes-console /dev/null /home/hermes-console/.ssh/authorized_keys
~~~

Copier ensuite **une ligne publique complète** `ssh-ed25519 ... commentaire` dans
`/home/hermes-console/.ssh/authorized_keys` depuis la console fournisseur. Un éditeur interactif est
préférable : il évite d'insérer la clé dans l'historique shell. Vérifier :

~~~sh
chown -R hermes-console:hermes-console /home/hermes-console/.ssh
chmod 700 /home/hermes-console/.ssh
chmod 600 /home/hermes-console/.ssh/authorized_keys
sshd -T | grep -E '^(pubkeyauthentication|authorizedkeysfile) '
~~~

Sur une distribution utilisant `ssh` plutôt que `sshd` comme unité, adapter uniquement le nom du
service après l'avoir inspecté avec `systemctl list-unit-files | grep -E '^ssh(d)?\.service'`.

## 4. Vérifier l'empreinte de l'hôte hors bande

Sur le VPS, via la console fournisseur :

~~~sh
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
~~~

Noter seulement l'algorithme et l'empreinte `SHA256:...` dans le ticket sécurisé. Sur la machine
Console, `ssh-keyscan` collecte une clé mais ne la rend pas digne de confiance :

~~~sh
install -d -m 0700 "$HOME/.ssh"
ssh-keyscan -t ed25519 -p <port> <host> > "$HOME/.ssh/<site>.known_hosts.pending"
ssh-keygen -lf "$HOME/.ssh/<site>.known_hosts.pending"
~~~

Comparer caractère par caractère avec l'empreinte lue dans la console fournisseur. Seulement si elles
sont identiques :

~~~sh
mv "$HOME/.ssh/<site>.known_hosts.pending" "$HOME/.ssh/<site>.known_hosts"
chmod 600 "$HOME/.ssh/<site>.known_hosts"
~~~

En cas de différence, arrêter. Ne pas utiliser `StrictHostKeyChecking=no`, ne pas effacer l'ancienne
empreinte et ne pas accepter le changement avant vérification via le fournisseur.

## 5. Déclarer la cible SSH côté serveur Console

Dans le `~/.ssh/config` de l'utilisateur OS qui exécute `apps/server` :

~~~sshconfig
Host hermes-<site>
    HostName <host>
    Port <port>
    User hermes-console
    IdentityFile ~/.ssh/<console_key>
    IdentitiesOnly yes
    StrictHostKeyChecking yes
    UserKnownHostsFile ~/.ssh/<site>.known_hosts
    BatchMode yes
    ServerAliveInterval 30
    ServerAliveCountMax 3
    ConnectTimeout 10
    ExitOnForwardFailure yes
~~~

Tester sans shell interactif :

~~~sh
ssh -o BatchMode=yes hermes-<site> 'id && umask'
ssh -o BatchMode=yes hermes-<site> 'true'
~~~

Le résultat DOIT identifier `hermes-console`, jamais `root`.

## 6. Durcir SSH sans se verrouiller dehors

Effectuer cette étape seulement après deux connexions réussies aux deux comptes, une élévation admin
prouvée et en gardant la console fournisseur ouverte. Créer
`/etc/ssh/sshd_config.d/60-hermes-console.conf` :

~~~sshconfig
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
AllowUsers <admin-user> hermes-console
GatewayPorts no
PermitTunnel no
X11Forwarding no

Match User hermes-console
    AllowTcpForwarding local
    PermitOpen 127.0.0.1:8642
    AllowAgentForwarding no
    PermitTTY no
~~~

Valider avant reload :

~~~sh
sshd -t
systemctl reload sshd
~~~

Si l'unité est `ssh.service`, recharger celle-ci. Ouvrir de **nouvelles** connexions admin et service,
prouver l'élévation admin puis seulement fermer la session root.

Des restrictions supplémentaires via `Match User` ou options `authorized_keys` doivent être testées
contre le tunnel : une clé avec `no-port-forwarding` casserait le transport Hermes.

## 7. Préparer le workdir partagé avec Hermes

Les opérations applicatives doivent viser le seul workdir convenu. Identifier d'abord l'utilisateur
du process Hermes (`<hermes-service-user>`). Puis créer un groupe partagé :

~~~sh
groupadd --force hermes-work
usermod -aG hermes-work hermes-console
usermod -aG hermes-work <hermes-service-user>
install -d -m 2770 -o hermes-console -g hermes-work /srv/hermes-console
install -d -m 2770 -o hermes-console -g hermes-work /srv/hermes-console/workdir
install -d -m 2770 -o hermes-console -g hermes-work /srv/hermes-console/workdir/in
install -d -m 2770 -o <hermes-service-user> -g hermes-work /srv/hermes-console/workdir/out
~~~

Redémarrer proprement le service Hermes seulement si nécessaire pour prendre en compte son nouveau
groupe. Ne pas rendre le workdir world-writable et ne pas ajouter `hermes-console` au groupe Docker.

Cette configuration de permissions n'est **pas** une frontière OS « workdir only » : le transport
système actuel ouvre un canal de commandes pour `mkdir`, `ls` et `scp`, et l'utilisateur peut encore
écrire dans les emplacements génériques autorisés par l'OS, notamment `/tmp`. Un chroot naïf
casserait ce transport. US-G1-008 reste donc bloquée jusqu'à ce qu'un
helper/sidecar borné ou une autre frontière OS démontre le refus des écritures hors workdir sans
casser tunnel et transfert. Le compte DOIT au minimum rester sans sudo, sans groupe Docker et sans
accès aux secrets ou répertoires des autres services.

### Empreintes et overlay Compose

Lorsque la Console tourne avec `compose.prod.ssh.yml`, le dossier fourni par `CONSOLE_SSH_DIR` est
monté en lecture seule à `/home/bun/.ssh`. Il contient uniquement `config` et l'`IdentityFile`
référencé par cette configuration. Les empreintes vérifiées depuis l'écran Runtime Hermes sont
conservées séparément dans le volume persistant `ssh-data`, dans
`/data/ssh/known_hosts`. L'API peut ainsi enregistrer une empreinte confirmée sans obtenir le droit
de modifier les clés privées.

Préparer le dossier fourni par `CONSOLE_SSH_DIR` sans y copier `known_hosts` :

~~~sh
ssh_dir=/secure/hermes-console-ssh
install -d -m 0700 "$ssh_dir"
install -m 0600 "$HOME/.ssh/<site>" "$ssh_dir/<site>"
install -m 0600 "$HOME/.ssh/config" "$ssh_dir/config"
~~~

Après le scan dans l'interface, comparer l'empreinte hors bande avant de cliquer sur « J'ai vérifié
cette empreinte ». Ne pas modifier le `known_hosts` de confiance pour provoquer un test négatif ;
utiliser un fichier jetable.

## 8. Qualifier l'hôte et installer Hermes sans collision

Avant toute installation, classifier l'hôte : `vierge dédié`, `partagé autorisé` ou `production
existante`. Relever au minimum OS, espace disque, listeners, services systemd, conteneurs, utilisateurs
et chemins de déploiement. Si un workload, un reverse proxy, un datastore ou des règles réseau non
documentés existent, arrêter l'installation et obtenir un VPS dédié ou une autorisation d'isolation
explicite. Un accès root ne vaut pas autorisation de perturber les services présents.

L'installation Hermes relève de US-G1-002 et DOIT fournir :

- une version ou image pinnée par digest avec provenance vérifiable ;
- un utilisateur de service non-root distinct de `hermes-console` et de `<admin-user>` ;
- une API liée uniquement à `127.0.0.1:8642` ;
- un secret dans un fichier `0600` ou un coffre, jamais dans Git, l'historique shell ou le transcript ;
- un workdir durable, des limites de ressources, aucun socket Docker et des mounts minimaux ;
- un service supervisé avec health/capabilities, logs expurgés et démarrage reproductible ;
- une procédure de rollback/désinstallation qui arrête le service sans supprimer implicitement les
  données, puis vérifie les listeners et fichiers restants.

Le rapport conserve manifeste effectif, version, identité du process et commandes de rollback. Ce
guide ne doit pas inventer une commande d'installation « latest » : la recette exacte est attachée à
la version Hermes acceptée dans US-G1-002.

## 9. Vérifier Hermes et le tunnel

Hermes DOIT écouter sur loopback côté VPS, par défaut `127.0.0.1:8642`, et non sur une interface
publique. Depuis le VPS :

~~~sh
ss -lntp | grep ':8642'
curl --fail --silent --show-error http://127.0.0.1:8642/v1/capabilities
~~~

Depuis la machine Console, choisir un port local libre et ouvrir un tunnel de preuve :

~~~sh
ssh -N -L 127.0.0.1:<local-port>:127.0.0.1:8642 hermes-<site>
~~~

Dans un autre terminal :

~~~sh
curl --fail --silent --show-error http://127.0.0.1:<local-port>/v1/capabilities
~~~

Fermer le tunnel et vérifier qu'aucun listener/process résiduel ne subsiste. Dans Hermes Console,
sélectionner le transport SSH, l'alias `hermes-<site>`, l'authentification `agent`, l'URL distante
`http://127.0.0.1:8642` et le workdir distant autorisé. Le mot de passe reste un mode de compatibilité,
pas la configuration B2B recommandée.

Le déploiement de production DOIT monter ou fournir au process Console, en lecture seule, la clé ou
socket d'agent nécessaire, le fichier `known_hosts` vérifié et le `~/.ssh/config` attendu. Le choix du
fichier d'empreintes DOIT être explicite et déterministe pour le chemin utilisant le binaire SSH ; il
ne suffit pas que le poste d'un développeur possède la bonne entrée.

## 10. Prouver les refus obligatoires

### Clé cliente inconnue

Créer une clé jetable dans un répertoire temporaire et tenter une connexion batch :

~~~sh
test_dir="$(mktemp -d)"
ssh-keygen -q -t ed25519 -N '' -f "$test_dir/unknown"
ssh -i "$test_dir/unknown" -o IdentitiesOnly=yes -o BatchMode=yes \
  -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$HOME/.ssh/<site>.known_hosts" \
  -p <port> hermes-console@<host> true
~~~

Le code de sortie DOIT être non nul, normalement `255`, avec un refus d'authentification. Vérifier
ensuite qu'aucune session ni écriture n'a été créée. Supprimer la clé jetable et noter uniquement son
empreinte publique et le code de sortie dans le rapport.

### Empreinte d'hôte inconnue ou modifiée

Utiliser un fichier `known_hosts` vide jetable avec `StrictHostKeyChecking=yes`. La connexion DOIT
échouer avant authentification. Ne jamais modifier le `known_hosts` de confiance pour provoquer ce
test.

### Chemin protégé hors workdir

Tenter via une commande SSH gérée d'écrire un fichier synthétique dans un répertoire de test protégé,
explicitement hors du workdir et non accessible au compte de service. L'opération DOIT échouer et l'inventaire
avant/après DOIT être identique. Tester séparément que les écritures dans `/tmp` et le home sont
refusées par la frontière retenue ; ne pas les supposer protégées par les permissions du workdir.

## 11. Rotation et révocation

### Rotation d'une clé cliente

1. générer une nouvelle clé dédiée et noter ses deux empreintes publiques ;
2. ajouter la nouvelle ligne publique à `authorized_keys` via l'accès encore valide ;
3. tester deux connexions batch avec la nouvelle clé ;
4. mettre à jour l'agent/config de la Console ;
5. retirer exactement l'ancienne ligne de `authorized_keys` ;
6. prouver que l'ancienne clé échoue et que la nouvelle réussit ;
7. supprimer l'ancienne clé privée du coffre selon sa procédure, puis fermer les sessions anciennes.

### Révocation urgente

Depuis la console fournisseur ou une seconde identité d'administration autorisée, supprimer la ligne
publique compromise, fermer ses sessions/process SSH, vérifier le refus, rechercher ses actions dans
les logs d'authentification et tourner tout secret potentiellement exposé. Ne pas désactiver le compte
tant que cela empêcherait la récupération contrôlée des fichiers ; appliquer la procédure d'incident.

Retirer une clé n'interrompt pas un `ControlMaster` déjà authentifié. La recette DOIT donc ouvrir un
tunnel et une commande distante avec l'ancienne clé avant révocation, fermer côté serveur les connexions de
cette identité, puis prouver que l'ancien canal et toute nouvelle connexion échouent. Elle fixe un SLA
de révocation mesuré et vérifie que la nouvelle identité reste fonctionnelle.

### Changement de clé d'hôte

Un changement inattendu est un incident, pas un simple warning. Confirmer la régénération dans la
console fournisseur, relever la nouvelle empreinte hors bande, archiver l'ancienne dans le ticket,
puis remplacer l'entrée dédiée. `ssh-keygen -R` seul n'est jamais une validation.

## 12. Résilience à tester

- ouvrir/fermer dix tunnels successifs et vérifier l'absence de fuite ;
- couper le réseau pendant une mission synthétique, puis vérifier état explicite et reconnexion ;
- changer de cible pendant qu'un tunnel existe et confirmer que l'ancien est fermé ;
- lancer deux missions synthétiques concurrentes sans mélange de workdirs/artefacts ;
- remplir un quota synthétique et vérifier un refus propre sans fichier partiel.

Chaque test doit suivre [`../evidence/README.md`](../evidence/README.md). Une réussite SSH manuelle seule
ne suffit pas à accepter US-G1-008.

Les erreurs de tunnel, commande distante, quota ou nettoyage DOIVENT remonter comme échec observable.
