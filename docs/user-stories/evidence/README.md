# Rapports de preuve

Un rapport réel est créé sous `evidence/YYYY-MM-DD-<gate>-<slug>.md`. Les rapports peuvent mentionner
une cible de test éphémère si elle est nécessaire à la reproductibilité, mais jamais un secret, une
clé privée, un mot de passe, un token, une adresse privée, un cookie ou une donnée client.

## Rapports disponibles

- [01-08-2026 — RBAC des cinq rôles](2026-08-01-gate-2-rbac.md) : preuve P-INT/P-SEC backend,
  P-E2E et acceptation produit encore ouvertes.
- [31-07-2026 — diagnostic SSH/SFTP sur VPS existant](2026-07-31-gate-1-ssh-vps-diagnostic.md) :
  preuve partielle, US-G1-008 `BLOQUÉE`.

## Modèle

~~~markdown
# Preuve — <titre>

- Date/heure UTC :
- Story : US-Gx-nnn
- Commit/build :
- Environnement : local | staging | VPS éphémère
- Opérateur : <identifiant non sensible>
- Reviewer :
- Cible : <alias ou identifiant expurgé>
- Versions Console/Hermes/PostgreSQL/OpenSSH :

## Préconditions

## Scénario positif

- Given :
- When :
- Then attendu :
- Résultat observé :
- Code de sortie/ID de corrélation :

## Scénarios négatifs

### <refus 1>

- Given :
- When :
- Then attendu :
- Résultat observé :
- Absence d'effet vérifiée par :

## Commandes et sorties expurgées

## Inventaire/hash avant et après

## Incidents, écarts et dérogations

## Nettoyage

## Verdict

VÉRIFIÉE | BLOQUÉE | REJETÉE

## Acceptation reviewer

- Nom/identifiant :
- Date :
- Décision : ACCEPTÉE | REFUSÉE
~~~

## Règles spécifiques SSH

Un rapport SSH conserve : algorithme et empreinte publique de l'hôte, empreintes publiques des clés
autorisée/inconnue, méthode de bootstrap, utilisateur non-root, version OpenSSH, codes de sortie,
preuve du tunnel, hash SFTP, refus hors workdir, rotation/révocation et nettoyage. Il ne conserve
jamais le contenu d'une clé, même publique, car l'empreinte suffit à la preuve.

## Revue

Le reviewer compare le rapport aux scénarios de la story, vérifie les tests négatifs et contrôle les
références croisées dans [`../TRACEABILITY.md`](../TRACEABILITY.md). Un rapport incomplet reste une
preuve de diagnostic, pas une acceptation.
