import { getHermesReleases } from "@/modules/updates/hermes-releases";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit"));
    const includeDrafts = url.searchParams.get("includeDrafts") === "true";
    const result = await getHermesReleases(limit, includeDrafts);
    return Response.json(
      {
        releases: result.releases,
        generatedAt: new Date(result.fetchedAt).toISOString(),
      },
      { headers: { "Cache-Control": "public, max-age=90" } },
    );
  } catch (error) {
    return Response.json(
      {
        error: {
          code: "HERMES_UPDATES_UNAVAILABLE",
          message: error instanceof Error ? error.message : "Erreur inconnue.",
        },
      },
      { status: 502 },
    );
  }
}
