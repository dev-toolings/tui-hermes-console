# Régularisation de traçabilité du commit `abd52ce`

- Date : 08-08-2026
- Commit audité : `abd52ce73d64805e3ba7d8ba4a4c014f4086e08f`
- Intitulé historique : `feat: add update chat`
- Verdict : intitulé non représentatif ; rattachement effectué par sous-périmètre, sans réécriture
  destructive de l'historique

## Décomposition factuelle

| Sous-périmètre du diff | Artefacts | État courant | Rattachement |
|---|---|---|---|
| Preuve d'activation du workspace SSH et routes nécessaires pendant le setup | `runtime/config.ts`, `setup/api-access.ts`, `index.ts` et tests | présent | `US-G1-SSH-005` et slice setup de `US-G1-007A` ; la persistance du workdir durable contribue à `US-G1-SSH-010` |
| Ancrage de messages et pièces jointes d'entrée dans le thread | `thread-messages.ts`, `xulux-chat/thread.tsx` et tests | présent | volet conversationnel de `US-G0-UX-003`, sans nouvelle acceptation : la preuve UI du 06-08-2026 reste antérieure au commit |
| Ajout et aperçu local des pièces jointes du chat | `chat-attachment-adapter.ts`, `file-preview-dialog.tsx`, composants assistant-ui et tests | présent | **hors périmètre d'acceptation courant** ; aucune story active ne promet l'upload/aperçu de fichiers du chat expert |
| Synchronisation et transfert de fichiers distants | anciens `artifacts/remote-sync.ts`, `ssh/scoped-sftp.ts` et typages associés | supprimé de l'arbre courant le 08-08-2026 | hors périmètre produit ; anciennes stories `US-G1-SSH-006/007/009` supprimées |

Cette décomposition ne rattache pas le commit à `US-G1-002D` : le diff ne modifie aucun module
`runtime/update*`. L'ancien rattachement déduit du seul message de commit était donc infondé.

## Preuve actuelle ciblée

Commande :

```text
bun test \
  apps/server/src/modules/setup/api-access.test.ts \
  apps/server/src/modules/runtime/config.test.ts \
  apps/web/src/components/assistant-ui/file-preview-dialog.test.ts \
  apps/web/src/lib/chat-attachment-adapter.test.ts \
  apps/web/src/lib/thread-messages.test.ts
```

Résultat sur l'arbre courant : `25 pass`, `0 fail`, `63 expect()`, cinq fichiers, Bun `1.3.13`.

Cette preuve unitaire confirme que les surfaces conservées restent cohérentes ; elle ne vaut ni
preuve navigateur du chat, ni acceptation de `US-G0-UX-003`, ni réouverture du transfert distant.

## Décision

- les changements setup/workspace sont rattachés aux stories existantes nommées ci-dessus ;
- le correctif conversationnel est rattaché à `US-G0-UX-003` tout en conservant l'écart de preuve
  antérieure au code ;
- l'upload/aperçu du chat est déclaré hors périmètre d'acceptation tant qu'une story dédiée n'est pas
  décidée ;
- le transfert distant est supprimé du code et du périmètre.

Le commit reste techniquement agrégé dans Git, mais chacune de ses capacités a désormais une décision
de périmètre explicite et auditable.
