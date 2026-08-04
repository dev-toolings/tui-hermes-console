import { z } from "zod";
import type { HermesDashboardLifecycleAction } from "@console/core/types/api";
import { apiErrorResponse } from "@/modules/api/errors";
import { assertSameOriginMutation } from "@/modules/api/same-origin";
import {
  getHermesDashboardStatus,
  manageHermesDashboard,
} from "@/modules/runtime/hermes-dashboard";

const lifecycleSchema = z.object({
  action: z.enum(["start", "restart"] satisfies HermesDashboardLifecycleAction[]),
  confirm: z.literal(true),
});

export async function GET() {
  try {
    return Response.json(
      { dashboard: await getHermesDashboardStatus() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const input = lifecycleSchema.parse(await request.json());
    return Response.json(
      { dashboard: await manageHermesDashboard(input.action) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
