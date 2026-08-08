# Preuve courante — US-G1-SSH-010 sur VM Proxmox — 2026-08-08

- **Date UTC :** 2026-08-08T13:37:53Z
- **Arbre de base :** `b80a78652173d51e1b15a178eb4b5198d34135a8`, correctifs courants non commités
- **Cible :** PVE 9.2.6, VMID 210 `hermes-ephemeral-01`
- **Runtime :** Hermes Agent `0.20.0`, Docker, image `latest` résolue par digest
- **Verdict :** `VÉRIFIÉE` techniquement sur l'arbre courant ; acceptation reviewer encore ouverte

## Topologie prouvée

~~~text
╔══════════════ VM Proxmox 210 ══════════════╗
║ ┌────────────────────────────┐  bind RW     ║
║ │ /srv/hermes-console/data   │────────────▶│ /opt/data · Hermes │
║ └────────────────────────────┘  fichiers    └────────────────────┘
║          ▲ SSH service 1001:1001 · sans sudo ni Docker           ║
╚══════════│════════════════════════════════════════════════════════╝
           │ tunnel loopback :8642 / :9119
           ▼
┌──────────────────────────────┐
│ Hermes Console · runtime SSH │
└──────────────────────────────┘
~~~

Légende : le bind mount est l'unique partage de fichiers ; SSH transporte les commandes et le
tunnel HTTP, jamais les octets de mission. Composants : VM PVE, Docker, stockage hôte, Hermes et
Console.

## Résultats réels

- `pvecli doctor` : 4 contrôles sur 4 ; PVE `9.2.6`, nœud en ligne.
- VM 210 : `running`, `2 vCPU`, `8 Gio`, disque `100 Gio`, QEMU Guest Agent joignable.
- Identités séparées : `ops` possède le sudo d'administration ; `hermes-console` est `1001:1001`,
  sans sudo général et sans accès au socket Docker.
- Runtime : `/health` `200`, plateforme `hermes-agent`, version `0.20.0` ;
  `/v1/capabilities` authentifié `200`.
- Dashboard : `/api/status` `200`, conteneur en réseau hôte et commande
  `dashboard --host 127.0.0.1 --port 9119 --no-open`.
- Stockage : montage observé `bind|/srv/hermes-console/data|/opt/data`, runtime publié uniquement
  sur `127.0.0.1:8642`.
- Workspace persisté : hôte `/srv/hermes-console/data/workspace`, Hermes
  `/opt/data/workspace`, état `ready`, révision Console `11`.
- Idempotence : le manager a résolu le même digest et retourné `updated=false` ; runtime toujours
  sain après le second passage.

## Mission synthétique sans transfert distant

Le compte de service a écrit un input synthétique sous le workspace hôte. Un processus exécuté avec
l'identité Hermes `1001:1001` dans le conteneur l'a lu depuis `/opt/data/workspace`, a écrit son
SHA-256 en sortie, puis le compte de service a relu cette sortie depuis le chemin hôte.

~~~text
bind_roundtrip=PASS
sha256=2ed7d525f8d6d304b15118b7c09b447be8e7ea20dc3d71e0d7b13de9bb7e04c7
~~~

Les fichiers synthétiques ont été supprimés après comparaison. Aucun SFTP, SCP ou transfert de
fichier applicatif n'a été utilisé.

## Correctifs nécessaires observés sur `latest`

- Dashboard : l'image refuse désormais `0.0.0.0` sans fournisseur d'authentification ; le compagnon
  utilise le réseau hôte et écoute strictement `127.0.0.1`.
- Démarrage : les sondes API et Dashboard attendent jusqu'à 60 secondes au lieu d'échouer pendant la
  synchronisation initiale des skills.
- Idempotence : la clé du fichier `runtime.env` est relue avec le privilège administrateur et
  comparée à celle du conteneur avant de décider de le conserver.
- Workspace : le compte de service passe par un manager root borné pour inspecter la topologie,
  régler `terminal.cwd` et tester une écriture. Il ne reçoit jamais `sudo docker`.

## Recheck du VPS historique

Le VPS historique a été relu ensuite en SSH strict et uniquement en lecture : ses conteneurs runtime
et Dashboard sont restés `running`, Hermes répond en `0.20.0`, capabilities retourne `200`, les deux
ports restent loopback et son bind mount reste intact. La configuration Console active pointe bien
sur `hermes-ephemeral-01`, pas sur ce VPS.

## Validations du dépôt

- typecheck : `@console/core`, `server`, `web` verts ;
- runtime SSH : `20` tests, `77` assertions, `0` échec ;
- suppression gouvernée PostgreSQL : `4` tests, `43` assertions, `0` échec ;
- RBAC HTTP + PostgreSQL : `13` tests, `206` assertions, `0` échec.
- suite complète : `634` tests passés, `3` skips explicites, `0` échec ; lint `0` erreur et
  `3` warnings connus.

## Limites

Cette preuve revalide la topologie, le runtime, le workspace et l'absence de transfert distant. Elle
ne constitue pas une acceptation humaine indépendante ni une preuve de perte complète d'hôte.
