import type { HermesReleaseWrite } from "@/modules/updates/hermes-releases";

const RELEASES_URL = "https://api.github.com/repos/NousResearch/hermes-agent/releases?per_page=50";

type GithubRelease = {
  id: number;
  tag_name: string;
  name: string | null;
  body: string | null;
  html_url: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  prerelease: boolean;
  draft: boolean;
};

function countReleaseNotes(body: string) {
  const counts = { noteCount: 0, featureCount: 0, improvementCount: 0, suppressionCount: 0 };
  let section = "feature";

  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (/^#{1,6}\s+/.test(line)) {
      const heading = line.toLowerCase();
      if (/remov|deprecat|breaking|supprim/.test(heading)) section = "suppression";
      else if (/fix|improv|enhanc|perf|amelior/.test(heading)) section = "improvement";
      else section = "feature";
      continue;
    }

    if (!/^(?:[-*+]\s+|\d+\.\s+)/.test(line)) continue;
    counts.noteCount += 1;
    if (section === "suppression") counts.suppressionCount += 1;
    else if (section === "improvement") counts.improvementCount += 1;
    else counts.featureCount += 1;
  }

  if (counts.noteCount === 0 && body.trim()) {
    counts.noteCount = 1;
    counts.featureCount = 1;
  }

  return counts;
}

function isGithubRelease(value: unknown): value is GithubRelease {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<GithubRelease>;
  return (
    typeof item.id === "number" &&
    typeof item.tag_name === "string" &&
    typeof item.html_url === "string" &&
    typeof item.created_at === "string" &&
    typeof item.updated_at === "string" &&
    typeof item.prerelease === "boolean" &&
    typeof item.draft === "boolean"
  );
}

export async function crawlGithubHermesReleases(): Promise<HermesReleaseWrite[]> {
  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
    "User-Agent": "hermes-console-release-sync",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const response = await fetch(RELEASES_URL, { headers, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`GitHub releases returned ${response.status} ${response.statusText}`);

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) throw new Error("GitHub releases payload is not an array");

  return payload.filter(isGithubRelease).map((release) => {
    const body = release.body ?? "";
    return {
      id: release.id,
      tagName: release.tag_name,
      name: release.name,
      body,
      htmlUrl: release.html_url,
      publishedAt: release.published_at ?? release.created_at,
      createdAt: release.created_at,
      updatedAt: release.updated_at,
      prerelease: release.prerelease,
      draft: release.draft,
      ...countReleaseNotes(body),
    };
  });
}
