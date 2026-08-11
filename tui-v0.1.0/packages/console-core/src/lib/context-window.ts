/**
 * Combien de contexte une conversation a déjà consommé.
 *
 * MESURE : le runtime ne publie aucune taille de fenêtre. `/v1/models` ne rend
 * que `{ id, fast, reasoning }` par modèle — vérifié sur Hermes 0.19.0. La table
 * ci-dessous est donc une connaissance de la Console, pas une donnée du runtime :
 * elle se périme, et c'est pour ça qu'un modèle inconnu ne reçoit pas une valeur
 * par défaut. Sans fenêtre connue, il n'y a pas de pourcentage honnête à
 * afficher — l'appelant masque l'indicateur plutôt que d'inventer une échelle.
 *
 * Valeurs relevées dans les documentations éditeurs (juillet 2026) :
 *  - Anthropic : 1 M pour Fable 5, Opus 5 / 4.8 / 4.7 / 4.6, Sonnet 5 / 4.6 ;
 *    200 K pour Haiku 4.5 et les générations 4.5 et antérieures.
 *  - OpenAI : 1 050 000 pour la famille GPT-5 (5.6 sol/terra/luna, 5.4), avec
 *    surcoût au-delà de 272 K — la fenêtre, elle, va bien jusqu'à 1,05 M.
 *  - Nous Research : 131 072 pour Hermes 4 (405B comme 70B).
 */

type WindowRule = { pattern: RegExp; tokens: number };

/**
 * Identifiants qui ne désignent aucun modèle : `hermes-agent` est le nom de
 * l'agent runtime (le vrai modèle est celui du fournisseur configuré derrière),
 * `default` et `moa` sont des agrégateurs virtuels du catalogue Hermes. Leur
 * fenêtre n'est pas connaissable ici — ils sortent avant toute autre règle.
 */
const NON_MODEL_ALIASES = /^(hermes-agent|default|moa(\/|$)|mixture-of-agents)/i;

/**
 * Du plus spécifique au plus général : la première règle qui correspond gagne.
 * Les générations à 200 K sont nommées avant la famille `claude-*`, sans quoi
 * elles hériteraient du 1 M des modèles courants.
 */
const WINDOW_RULES: readonly WindowRule[] = [
  // Variantes à contexte étendu, quel que soit l'éditeur.
  { pattern: /\[1m\]|-1m\b/i, tokens: 1_000_000 },

  // Anthropic — les générations plafonnées à 200 K, d'abord.
  { pattern: /^claude-haiku-4-5/i, tokens: 200_000 },
  { pattern: /^claude-(opus|sonnet)-4-(0|1|5)/i, tokens: 200_000 },
  { pattern: /^claude-[0-9]/i, tokens: 200_000 },
  { pattern: /^claude-(3|2)/i, tokens: 200_000 },
  // Anthropic — génération courante.
  { pattern: /^claude-(fable|mythos|opus|sonnet)-5/i, tokens: 1_000_000 },
  { pattern: /^claude-opus-4-(6|7|8)/i, tokens: 1_000_000 },
  { pattern: /^claude-sonnet-4-6/i, tokens: 1_000_000 },

  // OpenAI — GPT-5.x, toutes déclinaisons (sol / terra / luna / mini / nano).
  { pattern: /^gpt-5/i, tokens: 1_050_000 },

  // Nous Research — Hermes 4, le modèle (à ne pas confondre avec `hermes-agent`).
  { pattern: /^hermes-4/i, tokens: 131_072 },
];

/** Taille de fenêtre connue pour ce modèle, ou `null` si on l'ignore. */
export function contextWindowFor(model: string | null | undefined): number | null {
  const id = model?.trim();
  if (!id) return null;
  if (NON_MODEL_ALIASES.test(id)) return null;
  return WINDOW_RULES.find((rule) => rule.pattern.test(id))?.tokens ?? null;
}

/**
 * Le premier candidat dont la fenêtre est connue.
 *
 * L'appelant propose ses pistes de la plus fiable à la plus lointaine : modèle
 * de la session runtime, modèle du fil, modèle sélectionné dans le runtime. Un
 * agent qui tourne sous un alias (`hermes-agent`) n'a rien à dire sur sa
 * fenêtre ; c'est le modèle réellement servi derrière qui la fixe.
 */
export function resolveContextModel(
  candidates: ReadonlyArray<string | null | undefined>,
): string | null {
  for (const candidate of candidates) {
    if (contextWindowFor(candidate)) return candidate!.trim();
  }
  return null;
}

export type ContextUsage = {
  used: number;
  window: number;
  /** Part occupée, bornée à 1 — l'anneau ne fait pas plusieurs tours. */
  ratio: number;
  /** Entier 0–100, arrondi vers le bas : mieux vaut annoncer moins que trop. */
  usedPercent: number;
  remainingPercent: number;
  /** Le cumul a dépassé la fenêtre : le pourcentage restant vaut 0, pas un négatif. */
  exceeded: boolean;
  /** Au-delà de ce seuil, l'indicateur s'alarme. */
  critical: boolean;
};

const CRITICAL_RATIO = 0.85;

/**
 * Rapporte des tokens consommés à la fenêtre du modèle.
 *
 * `null` quand la question n'a pas de réponse : modèle inconnu, fenêtre absurde,
 * ou aucun token compté. Un indicateur vaut mieux absent que faux.
 */
export function contextUsage(
  usedTokens: number | null | undefined,
  model: string | null | undefined,
): ContextUsage | null {
  const window = contextWindowFor(model);
  if (!window || window <= 0) return null;
  if (usedTokens == null || !Number.isFinite(usedTokens) || usedTokens < 0) return null;

  const raw = usedTokens / window;
  const ratio = Math.min(1, raw);
  const usedPercent = Math.min(100, Math.floor(raw * 100));

  return {
    used: usedTokens,
    window,
    ratio,
    usedPercent,
    remainingPercent: Math.max(0, 100 - usedPercent),
    exceeded: raw > 1,
    critical: raw >= CRITICAL_RATIO,
  };
}
