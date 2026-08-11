# G1-006D-local — restauration scratch d’un export métier

Ce slice restaure uniquement un export métier déjà vérifié vers une base
PostgreSQL et un répertoire d’artefacts scratch vides. Il ne constitue pas un
backup disaster-recovery : le bundle ne contient ni identité, ni sites, ni
agents, ni politiques, ni journal d’audit complet.

```text
╔═ bundle JSON + SHA-256 ═╗
║ vérification relationnelle║
╚══════════╤═══════════════╝
           │ données métier + octets
           ▼
┌─────────────────────────────┐
│ restoreLifecycleExportToScratch │
│ cible explicitement bornée     │
└──────────────┬────────────────┘
               │ transaction SQL
               ▼
╔═ PostgreSQL scratch ═╗   ╔═ files scratch ═╗
║ rows métier isolées  ║   ║ octets vérifiés ║
╚══════════════════════╝   ╚═════════════════╝
```

## Préconditions

- la base scratch contient déjà le site et ses identités de fixture ;
- le répertoire d’artefacts scratch est absent ou vide ;
- le SHA-256 fourni correspond au fichier exporté ;
- aucune cible de production, aucun volume partagé et aucun hôte distant ne
  sont utilisés.

Le restaurateur refuse une cible occupée, un site différent, un bundle altéré
ou incomplet, et toute écriture métier qui révélerait une cible déjà peuplée.
Les fichiers sont écrits sous `restored/<sha256(site,id)>.bin`; les chemins du
bundle source ne sont jamais réutilisés.

## Exécution ciblée

La preuve PostgreSQL + fichiers scratch est reproductible avec :

```sh
bun test apps/server/drizzle/lifecycle-restore.integration.test.ts
bun run --filter server typecheck
```

Pour rejouer le restaurateur sur une base scratch déjà migrée, sans API ni
production :

```sh
bun apps/server/scripts/restore-lifecycle-scratch.ts \
  ./hermes-console-data-lifecycle-export.json \
  <sha256-du-fichier> \
  postgres://postgres@127.0.0.1:5432/lifecycle_restore \
  ./scratch-files \
  <site-de-fixture>
```

Le script ne supprime rien et échoue si la cible n’est pas vide.

## Limites explicites

Cette preuve ne ferme pas US-G1-006D ni la story US-G1-006 complète. Elle ne
prouve pas un dump restaurable complet, un backup externe, une perte d’hôte,
un rollback, une purge ou une opération P-OPS/P-SEC. Une définition séparée
du backup disaster-recovery devra couvrir le schéma, les identités, les sites,
les agents, les policies et le ledger d’audit avant toute revendication de
restauration complète.
