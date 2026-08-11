# Preuve — US-G1-SSH-001/002 (auto-run)
- Date/heure UTC : 2026-08-04T08:47:05Z
- Date/heure locale : 2026-08-04T10:47:05+02:00
- Story : US-G1-SSH-001, US-G1-SSH-002
- Cible : 18755-diagnostic-hostkey
- Host/IP : 187.55.227.55:22

- Test tunnel ignoré (SSH_SKIP_TUNNEL_TEST=1).
## US-G1-SSH-001 / US-G1-SSH-002
- Étape 1: pré-écoute host-key (scan)
- 3072 SHA256:dNfyyWexjkSKJ4ke3yvCY4Sv0x+awhKZdvdQkUs+FCo 187.55.227.55 (RSA)
- 256 SHA256:ef0Sgvvh0+jVXwZ+3/l/FWQc3vQBoxwwxL8hAjHV2nM 187.55.227.55 (ED25519)
- Étape 2: collecte host-key officielle (hors bande)
- Empreinte scannée (hôte) : SHA256:dNfyyWexjkSKJ4ke3yvCY4Sv0x+awhKZdvdQkUs+FCo
- SHA256 du fichier scan : 0716ea77588afb3755339d2e603527e93becb4345ba557cd735a1c07adb22757
- Détails hôte scanné : 3072 SHA256:dNfyyWexjkSKJ4ke3yvCY4Sv0x+awhKZdvdQkUs+FCo 187.55.227.55 (RSA)
- Vérification manuelle de l'empreinte attendue à effectuer sur source fournisseur.
- known_hosts dédié généré localement (ligne complète masquée).
- known_hosts final à l'hôte: /home/kev/.ssh/18755-diagnostic-hostkey.known_hosts
- Étape 3: test tunnel batch sauté (SSH_SKIP_TUNNEL_TEST=1).
- Résultat global : BLOQUÉ (tunnel non exécuté)
- Exécution terminée. Vérifiez manuellement le rapport : docs/user-stories/evidence/2026-08-04-ssh-001-002-18755-diagnostic-hostkey.md
