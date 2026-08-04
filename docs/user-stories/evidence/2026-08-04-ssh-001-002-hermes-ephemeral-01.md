# Preuve — US-G1-SSH-001/002 (auto-run)
- Date/heure UTC : 2026-08-04T11:31:25Z
- Date/heure locale : 2026-08-04T13:31:25+02:00
- Story : US-G1-SSH-001, US-G1-SSH-002
- Cible : hermes-ephemeral-01
- Host/IP : 192.168.1.210:22

## US-G1-SSH-001 / US-G1-SSH-002
- Étape 1: pré-écoute host-key (scan)
- 256 SHA256:GZaWhVnELHA7S590n8FjL51XzlHVvBAStYCCpo2CjgA 192.168.1.210 (ED25519)
- 3072 SHA256:TPueO1JJJE9iLkJ7FPR2IBYPAOibxOyPZDV8S/BOdbE 192.168.1.210 (RSA)
- 256 SHA256:wf82zhomUtvm41kJqwBoJ7IJcPlPnCR1P3/w55gmjJI 192.168.1.210 (ECDSA)
- Étape 2: collecte host-key officielle (hors bande)
- SHA256 du fichier scan : 0f90c2cdd7a6b9bb553c74ae0ced21c9bb33fecdc3187b7d1c35d7852d9debdf
- Empreintes scannées (toutes les clés d'hôte) :
  - 256 SHA256:wf82zhomUtvm41kJqwBoJ7IJcPlPnCR1P3/w55gmjJI 192.168.1.210 (ECDSA)
  - 3072 SHA256:TPueO1JJJE9iLkJ7FPR2IBYPAOibxOyPZDV8S/BOdbE 192.168.1.210 (RSA)
  - 256 SHA256:GZaWhVnELHA7S590n8FjL51XzlHVvBAStYCCpo2CjgA 192.168.1.210 (ED25519)
- Empreinte fournisseur attendue : SHA256:GZaWhVnELHA7S590n8FjL51XzlHVvBAStYCCpo2CjgA
- Concordance stricte sur : 256 SHA256:GZaWhVnELHA7S590n8FjL51XzlHVvBAStYCCpo2CjgA 192.168.1.210 (ED25519)
- Clés d'hôte présentes dans known_hosts mais NON vérifiées hors bande :
  - 256 SHA256:wf82zhomUtvm41kJqwBoJ7IJcPlPnCR1P3/w55gmjJI 192.168.1.210 (ECDSA)
  - 3072 SHA256:TPueO1JJJE9iLkJ7FPR2IBYPAOibxOyPZDV8S/BOdbE 192.168.1.210 (RSA)
  (fournir l'empreinte fournisseur de chaque type pour une vérification complète)
- known_hosts dédié généré localement (ligne complète masquée).
- known_hosts final à l'hôte: /home/kev/.ssh/hermes-ephemeral-01.known_hosts
- Étape 3: acceptation stricte et test tunnel batch (si clé disponible)
- Test tunnel batch OK (code 0).
  - hermes-console
  - 1003
  - 0002
- Résultat global : SUCCÈS
- Exécution terminée. Vérifiez manuellement le rapport : docs/user-stories/evidence/2026-08-04-ssh-001-002-hermes-ephemeral-01.md
