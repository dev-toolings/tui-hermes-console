# G1-006C — préparation backup externe et restauration scratch

Cette recette prépare la preuve sans toucher à la production. Elle ne doit être exécutée qu’avec
une cible externe dédiée et un reviewer sécurité/exploitation.

## Préconditions obligatoires

- destination de backup distincte du volume `files-data` et de l’hôte PostgreSQL de production ;
- base et volume scratch séparés, jamais une restauration par-dessus la production ;
- accès owner PostgreSQL pour reconstruire le schéma, mais jamais l’URL owner dans le navigateur ;
- empreinte et identité de la destination vérifiées hors bande ;
- fenêtre de test, inventaire initial et identifiant de corrélation enregistrés.

## Vérifier le bundle avant copie

Après `POST /api/settings/data-lifecycle/exports`, conserver le fichier JSON et la valeur de
`x-lifecycle-export-sha256`, puis exécuter :

```sh
bun apps/server/scripts/verify-lifecycle-export.ts \
  ./hermes-console-export-<preview-id>.json \
  <sha256-retourné-par-la-réponse>
```

Le vérificateur est sans écriture, sans shell et sans accès réseau. Il contrôle le JSON, le digest
du bundle, les doublons, la taille et le SHA-256 de chaque artefact base64.

## Ce qui reste à produire pour fermer G1-006C

1. copier le bundle vers la destination externe avec un outil approuvé et journaliser le hash distant ;
2. reconstruire une base et un volume scratch à partir d’un backup réellement restaurable ;
3. comparer les manifestes, les corrélations, les métadonnées et les octets avec le bundle vérifié ;
4. détruire la cible scratch et conserver le rapport P-OPS/P-SEC.

Un simple fichier JSON sur le même hôte, un dump non restauré ou un volume Docker local ne constitue
pas un backup externe. Tant que ces quatre étapes n’ont pas été exécutées, G1-006 et Gate 1 restent
ouverts.
