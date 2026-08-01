# Gate 0 — Validation commerciale

**Reviewer final :** responsable produit avec accord du partenaire concerné.

**Critère de sortie :** preuve d'un workflow utile et engagement payant avant tout investissement
fleet.

## Frontière d'expérimentation

La Gate 0 autorise la découverte et des essais supervisés dans une sandbox isolée, avec identifiants
et données synthétiques. Elle n'autorise pas un pilote sur une production cliente ni des données
sensibles. Un tel pilote exige d'abord les protections minimales applicables de Gate 1 : durabilité,
confinement, avertissement IA et, pour une cible distante, parcours SSH sécurisé. La Gate 0 peut être
acceptée commercialement sans prétendre que ces protections opérationnelles sont déjà livrées.

## US-G0-001 — Qualifier trois design partners

> En tant que responsable produit, je veux qualifier trois agences, intégrateurs ou MSP, afin de
> tester le wedge sur des opérateurs qui gèrent réellement des installations clientes.

- **Dépendances :** aucune.
- **Acceptation positive :** Étant donné la grille ICP du PRD, quand trois organisations sont
  interviewées, alors chacune documente nombre d'opérateurs, nombre de clients, workflow supervisé,
  infrastructure, décideur, budget, douleur actuelle et contraintes de données.
- **Acceptation négative :** Étant donné un prospect solo, sans client opéré ou cherchant seulement
  un chat, quand il est évalué, alors il n'est pas compté parmi les trois partenaires.
- **Preuves :** `P-COM`, trois fiches expurgées, consentement au pilote, raisons de qualification ou
  rejet.
- **État initial :** `PROPOSÉE`.

## US-G0-002 — Piloter un workflow étroit par partenaire

> En tant qu'opérateur partenaire, je veux piloter une mission supervisée et peu risquée dans une
> sandbox représentative d'un client, afin de mesurer la valeur sans masquer le travail manuel.

- **Dépendance :** US-G0-001.
- **Acceptation positive :** Étant donné un workflow borné, des données synthétiques et une sandbox
  isolée, quand il est exécuté de bout en bout,
  alors la demande, la mission, les interventions, la décision humaine, le résultat et les artefacts
  sont corrélés et le client confirme l'utilité.
- **Acceptation négative :** Étant donné une action destructive, un usage à haut impact, des données
  sensibles, une production cliente avant les protections Gate 1 ou un périmètre non borné, quand il
  est proposé, alors le pilote le refuse ou le réduit avant exécution.
- **Preuves :** `P-COM`, `P-E2E`, protocole par partenaire, rapport de mission expurgé, incidents et
  reprises manuelles.
- **État initial :** `PROPOSÉE`.

## US-G0-003 — Décider sur des métriques et un engagement payant

> En tant que responsable produit, je veux une décision commerciale falsifiable, afin de ne pas
> construire la fleet sur une demande supposée.

- **Dépendance :** US-G0-002.
- **Acceptation positive :** Étant donné trois pilotes, quand la revue est tenue, alors sont mesurés
  temps d'installation, taux d'états terminaux cohérents, interventions manuelles, coût de support,
  valeur perçue et engagement financier signé.
- **Acceptation négative :** Étant donné l'absence d'engagement payant ou un besoin principalement
  hors positionnement, quand la revue est tenue, alors le verdict est `NO-GO` ou `PIVOT`, jamais un
  passage implicite à la Gate 1.
- **Preuves :** `P-COM`, tableau agrégé des métriques, objections, montant et durée de l'engagement,
  décision `GO/NO-GO/PIVOT`.
- **État initial :** `PROPOSÉE`.
