/**
 * Verdict d'une sonde du runtime Hermes — ce que `GET /api/runtime/probe`
 * renvoie et ce que l'écran Support affiche.
 *
 * Volontairement pauvre : la configuration résolue côté serveur contient le
 * token déchiffré, elle ne doit pas traverser HTTP.
 */
export type RuntimeProbeDto = {
  ok: boolean;
  version: string | null;
  /** Aller-retour mesuré côté serveur, `null` si le runtime n'est pas configuré. */
  latencyMs: number | null;
  error: string | null;
  features: string[];
};
