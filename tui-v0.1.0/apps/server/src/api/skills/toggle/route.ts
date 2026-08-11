import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import { assertSameOriginMutation } from "@/modules/api/same-origin";
import { toggleHermesDashboardSkill } from "@/modules/runtime/hermes-skills-admin";

const toggleSkillSchema = z.object({
  name: z.string().trim().min(1).max(200),
  enabled: z.boolean(),
});

export async function PUT(request: Request) {
  try {
    assertSameOriginMutation(request);
    const input = toggleSkillSchema.parse(await request.json());
    return Response.json(await toggleHermesDashboardSkill(input));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
