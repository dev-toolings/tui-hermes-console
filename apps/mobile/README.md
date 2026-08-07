# Hermes Console Mobile

Client Expo/React Native de Hermes Console. La Console reste l'autorité des comptes, sites,
mandats, missions, décisions et preuves. L'application ne contacte jamais Hermes directement.

## Développement

Depuis la racine du monorepo :

```bash
bun install
bun run dev:mobile
```

Le démarrage standard force le mode headless Expo afin de ne jamais télécharger ou lancer le
Chromium de React Native DevTools sur un serveur Linux/SSH. Sur une machine avec interface
graphique, le shell DevTools autonome reste disponible explicitement avec
`bun run --filter mobile start:interactive`.

Validation reproductible :

```bash
bun run --filter mobile typecheck
bun run build:mobile
```

L'export produit les bundles Android, iOS et Web dans `apps/mobile/dist`.

## Association sécurisée

1. Ouvrir `Paramètres → Sécurité` dans la Console Web.
2. Choisir `Associer un appareil`.
3. Copier le code à usage unique.
4. Dans l'application, ouvrir `Compte`, saisir l'URL HTTPS et coller le code.

Le code expire après dix minutes et est supprimé lors de son premier échange. La session mobile
opaque est ensuite conservée par `expo-secure-store`. Les tokens Hermes et les clés fournisseur ne
doivent jamais entrer dans l'application.

La migration `0038_mobile_pairing.sql` doit être appliquée avant l'association d'un appareil.

## assistant-ui Native

`src/components/chat-thread.tsx` contient la couche UI native. L'adaptateur
`src/adapters/hermes-chat-adapter.ts` utilise les endpoints Console existants pour créer un thread,
envoyer les messages et réconcilier le run. Le stockage métier reste dans PostgreSQL côté Console.

## SimDeck

SimDeck exige actuellement macOS Apple Silicon, Xcode et les runtimes Simulator. Sur cette machine :

```bash
cd apps/mobile
bun run simdeck
```

Après sélection d'un device avec `simdeck use <udid>`, installer un build `.app` ou `.apk`, puis :

```bash
bun run test:simdeck
```

Le smoke test vérifie la navigation Accueil, Missions, Assistant et Compte, puis écrit une capture
dans `artifacts/simdeck`.

Sur une pull request, les workflows macOS produisent aussi les builds natifs. Une fois le secret
optionnel `SIMDECK_PASSWORD` configuré, commenter la PR avec l'une de ces commandes ouvre une
session temporaire dans le navigateur :

```text
simdeck run ios
simdeck run android
```

Les sessions utilisent le profil `full`, soit la cible SimDeck plein écran à 60 fps. L'émulateur
Android reçoit 6 Gio de RAM (`-memory 6144`) et le rendu GPU hôte. Le simulateur iOS partage la
mémoire du runner macOS et n'expose pas de quota RAM individuel.
