import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import { assertSameOriginMutation } from "@/modules/api/same-origin";
import {
  getActiveStorageMigrationState,
  startStorageMigration,
} from "@/modules/runtime/ssh/storage-migration";

const schema = z.object({
  planId: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
  confirmation: z.string().trim().min(1).max(500),
});

export async function GET() {
  return Response.json(
    { migration: await getActiveStorageMigrationState() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const job = await startStorageMigration(schema.parse(await request.json()));
    return Response.json({ job }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
