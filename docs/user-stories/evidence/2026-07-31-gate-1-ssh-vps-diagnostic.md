# Preuve — Diagnostic SSH/SFTP sur VPS existant

- **Date :** 31-07-2026
- **Story :** US-G1-008
- **Environnement :** VPS distant existant, non vierge
- **Cible de test :** `187.55.227.55`
- **Verdict :** `BLOQUÉE` — diagnostic partiel, pas une acceptation

## Portée et garde-fous

Le serveur contenait déjà des workloads Docker actifs et n'était donc pas le VPS vierge requis par
le scénario. Hermes n'y était pas installé. Aucune installation, modification de configuration SSH,
création de compte, rotation de clé, mutation durable ou interruption des workloads n'a été réalisée.

Cette passe vérifie seulement des propriétés de transport et de refus avec des données synthétiques.
Elle ne prouve ni le bootstrap fournisseur, ni le compte dédié attendu, ni le tunnel vers l'API
Hermes, ni le workdir durable, ni la résilience en mission.

## Environnement observé

- L'empreinte publique ED25519 de l'hôte était
  `SHA256:ef0Sgvvh0+jVXwZ+3/l/FWQc3vQBoxwwxL8hAjHV2nM`.
- Les accès préexistants `root` et `deploy` par identité autorisée ont réussi.
- OpenSSH a averti que la négociation n'utilisait pas de mécanisme d'échange de clés post-quantique.
  Cet avertissement est conservé comme dette de durcissement ; il n'a pas été masqué et ne vaut pas
  échec d'authentification classique.
- Hermes était absent ; aucun endpoint loopback `:8642` n'a donc pu être testé.

## Résultats par sous-scénario

| ID | Test observé | Résultat | Portée du résultat |
|---|---|---|---|
| `SSH-001` | bootstrap d'un VPS sans notre clé | non exécuté | serveur non vierge, accès déjà configuré |
| `SSH-002` | empreinte ED25519 directe | partiel | empreinte relevée et utilisée pour les contrôles suivants |
| `SSH-003` | compte dédié `hermes-console` | non exécuté | seuls comptes préexistants `root`/`deploy` observés |
| `SSH-004` | clé locale inconnue | réussi | refus publickey, exit 255, aucun accès |
| `SSH-005` | `known_hosts` vide + strict checking | réussi | refus avant confiance, exit 255 |
| `SSH-006` | SFTP synthétique aller/retour | partiel | hash identique et nettoyage, périmètre workdir cible non prouvé |
| `SSH-007` | tunnel vers Hermes | non exécuté | seulement un forward vers SSH a été sondé |
| `SSH-008` | rotation/révocation | non exécuté | aucune mutation durable autorisée |
| `SSH-009` | résilience/concurrence/quota | non exécuté | hors portée de la passe non destructive |

## Scénarios négatifs

### Clé cliente inconnue

- **Given :** une clé locale non autorisée d'empreinte publique
  `SHA256:3yW2jTi6Hu2PKf8tHcjM3CjX9xA1aBcpmEbVCbEeluM`.
- **When :** une connexion batch est tentée avec cette seule identité.
- **Then attendu :** refus sans fallback ni session.
- **Résultat observé :** exit `255`, `Permission denied (publickey)`.
- **Absence d'effet :** aucun accès et aucune mutation distante résultante.

### Empreinte d'hôte non connue

- **Given :** un fichier `known_hosts` jetable vide avec `StrictHostKeyChecking=yes`.
- **When :** une connexion est tentée.
- **Then attendu :** échec avant authentification.
- **Résultat observé :** exit `255` ; aucune acceptation interactive de l'empreinte.
- **Absence d'effet :** aucune session distante créée.

## SFTP synthétique

Un fichier `README` synthétique a été transféré puis récupéré par SFTP. Le hash SHA-256 de
l'aller/retour était :

`a2696aa0ff55b73634a063569d0d910e31c17f98374067c1d463f43615ce9b31`

Le fichier distant de test a été nettoyé. Ce résultat prouve le transport SFTP sur la cible existante,
mais pas le workdir Hermes cible ni sa durabilité. Le chemin applicatif actuel peut absorber certaines
erreurs SFTP ; un succès manuel ne prouve donc pas encore la propagation d'échec Console.

## Tunnel synthétique

Un port local a été forwardé vers le service SSH distant. L'empreinte vue au travers du forward était
identique à l'empreinte ED25519 obtenue en connexion directe. Après fermeture du tunnel, le port local
n'écoutait plus.

Ce test prouve un cycle élémentaire de port forwarding. Il ne prouve pas `SSH-007`, car Hermes était
absent et aucune réponse `/v1/capabilities` directe/forwardée n'a pu être comparée.

## Lacunes produit constatées

1. Le déploiement production ne monte pas encore de clé SSH, de socket `ssh-agent`, de
   `known_hosts` dédié ni de config SSH dans le process Console.
2. La sélection déterministe d'un `known_hosts` strict pour le chemin utilisant le binaire SSH reste
   à prouver dans le déploiement, indépendamment du poste opérateur.
3. Le workdir distant actuellement observé sous `/tmp` n'offre pas de durabilité exploitable.
4. Le transport système conserve un canal de commandes compatible `mkdir`/`ls`/`scp` ; le workdir
   n'est donc pas encore une frontière OS et le tunnel doit être borné avec `PermitOpen`.
5. Certaines erreurs SFTP sont absorbées ; elles doivent devenir des échecs visibles et corrélés.
6. Aucun VPS vierge, utilisateur dédié non-root, admin/recovery séparé, Hermes distant, concurrence,
   coupure réseau, quota, rotation ou révocation n'a été testé.

## Nettoyage

- fichier SFTP synthétique distant supprimé ;
- artefacts temporaires locaux supprimés ;
- tunnel fermé et port local confirmé fermé ;
- aucune configuration ou workload distant modifié.

## Verdict et suite

`BLOQUÉE`. Le diagnostic apporte des preuves utiles pour `SSH-002`, `SSH-004`, `SSH-005` et une
partie de `SSH-006`, mais ne satisfait pas US-G1-008. La prochaine recette doit utiliser un VPS
réellement vierge ou réinitialisé, suivre `SSH-001` à `SSH-009`, installer/configurer Hermes dans un
périmètre autorisé et produire les preuves de tunnel API, workdir durable, refus et résilience.
