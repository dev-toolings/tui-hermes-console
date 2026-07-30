/**
 * Identité du miroir Console ↔ runtime Hermes.
 *
 * L'écran Agents s'en sert pour marquer cet agent comme protégé (il est
 * régénéré par le seed, pas créé à la main), et le seed s'en sert pour le
 * retrouver. Les deux côtés doivent nommer le même identifiant.
 */
export const HERMES_SEEDED_AGENT_ID = "agent_hermes_runtime";
export const HERMES_SEEDED_AGENT_SLUG = "hermes-agent";
