import { groupPartByType } from "@assistant-ui/react";

/**
 * Le reasoning textuel et les appels d’outils sont deux surfaces distinctes.
 * Ne pas les remettre sous un groupe parent commun nommé « Réflexion » :
 * un run qui n’émet qu’un tool-call ne doit jamais afficher un faux bloc
 * de raisonnement.
 */
export const hermesMessageGroupBy = groupPartByType({
  reasoning: ["group-reasoning"],
  "tool-call": ["group-tool"],
});
