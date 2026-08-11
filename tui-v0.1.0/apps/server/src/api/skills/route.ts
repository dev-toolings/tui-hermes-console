import type { HermesSkillDto } from "@console/core/types/api";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";
import { apiErrorResponse } from "@/modules/api/errors";
import { resolveHermesRuntimeConfig } from "@/modules/runtime/config";
import { listHermesSkills } from "@/modules/runtime/hermes-adapter";
import { listHermesDashboardSkills } from "@/modules/runtime/hermes-skills-admin";

/**
 * Inventaire des skills visibles par le runtime Hermes du contexte courant.
 *
 * Hermes expose une liste runtime globale via `/v1/skills`, sans paramètre de
 * filtrage par projet. Le projet du mandat reste renvoyé pour que l’interface
 * affiche le périmètre réellement sélectionné sans fabriquer un filtrage.
 */
export async function GET(
  _request: Request,
  context: AuthenticatedRouteContext,
) {
  try {
    let skills: HermesSkillDto[];
    let skillsMutable = false;

    try {
      skills = await listHermesDashboardSkills();
      skillsMutable = true;
    } catch {
      const config = await resolveHermesRuntimeConfig();
      skills = await listHermesSkills(config);
    }
    const projectId = context.siteContext.mandateProjectId;

    return Response.json({
      skills,
      skillsMutable,
      projectId,
      scope: projectId ? "project" : "site",
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
