import type { IncomingMessage, ServerResponse } from "node:http";
import type { GhIssue, GhRepo, RepoInsight, RepoInsightErrors } from "../types/github";
import { buildRepoInsight } from "../utils/insights";
import { memoize } from "./cache";
import { getIssuesCached, getReposCached } from "./dashboardData";
import { describeRestError, ghApiJson, restApiPaginate } from "./githubClient";
import { sendJsonCacheable } from "./http";
import { mapPool } from "./localScan";
import { fetchRepoSecuritySummary } from "./securityAlerts";

interface ReleaseAssetApi {
  download_count: number;
}

interface ReleaseApi {
  published_at: string | null;
  assets?: ReleaseAssetApi[];
}

async function fetchReleases(repo: string) {
  const result = await restApiPaginate<ReleaseApi>(`/repos/${repo}/releases?per_page=100`);
  if (!result.ok) return { ok: false as const, error: result.error, status: result.status };
  return { ok: true as const, data: result.data };
}

async function fetchInsightForRepo(repo: GhRepo, issues: GhIssue[]): Promise<RepoInsight> {
  const [views, releases, security] = await Promise.all([
    ghApiJson(`/repos/${repo.nameWithOwner}/traffic/views`),
    fetchReleases(repo.nameWithOwner),
    fetchRepoSecuritySummary(repo.nameWithOwner),
  ]);
  const releaseList = releases.ok ? releases.data : [];
  const sumAssetDownloads = (list: ReleaseApi[]) =>
    list.reduce(
      (sum, release) =>
        sum +
        (release.assets ?? []).reduce(
          (assetSum, asset) => assetSum + (asset.download_count || 0),
          0,
        ),
      0,
    );
  const totalDownloads = releases.ok ? sumAssetDownloads(releaseList) : 0;
  const recentDownloads = releases.ok
    ? sumAssetDownloads(
        releaseList.filter(
          (release) =>
            release.published_at &&
            Date.now() - new Date(release.published_at).getTime() <= 30 * 86_400_000,
        ),
      )
    : 0;
  const latestReleasePublishedAt =
    releaseList
      .map((release) => release.published_at)
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;

  const viewData = views.ok ? (views.data as { count?: number; uniques?: number } | null) : null;

  // Each failed call carries its real reason; the value falls back to 0 but the
  // UI keys off `errors` so a failed fetch is shown as an error, never a real 0.
  const errors: RepoInsightErrors = {};
  if (!views.ok) errors.views = describeRestError(views.error, views.status);
  if (!releases.ok) errors.downloads = describeRestError(releases.error, releases.status);
  if (security.unavailable) errors.security = security.unavailableReason ?? "Could not be read.";

  return buildRepoInsight({
    repo,
    issues,
    viewsCount: viewData?.count ?? 0,
    viewsUniques: viewData?.uniques ?? 0,
    releaseCount: releaseList.length,
    totalDownloads,
    recentDownloads,
    latestReleasePublishedAt,
    securityAlertsCount: security.totalOpen,
    errors,
  });
}

const INSIGHTS_TTL_MS = 15 * 60 * 1000;

type RepoInsightsResult =
  | { ok: true; generatedAt: string; insights: RepoInsight[] }
  | { ok: false; error: string };

const store = memoize<RepoInsightsResult>(
  INSIGHTS_TTL_MS,
  async (forceFresh): Promise<RepoInsightsResult> => {
    const [repos, issues] = await Promise.all([
      getReposCached(forceFresh),
      getIssuesCached(forceFresh),
    ]);
    if (!repos.ok) return repos;
    if (!issues.ok) return issues;

    const insights = await mapPool(repos.repos, 6, async (repo) =>
      fetchInsightForRepo(repo, issues.issues),
    );
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      insights: insights.sort(
        (a, b) =>
          b.securityAlertsCount - a.securityAlertsCount ||
          b.issueCount - a.issueCount ||
          a.repo.localeCompare(b.repo),
      ),
    };
  },
  { shouldCache: (v) => v.ok },
);

export function getRepoInsightsCached(forceFresh: boolean): Promise<RepoInsightsResult> {
  return store.get(forceFresh);
}

export async function handleRepoInsights(
  req: IncomingMessage,
  res: ServerResponse,
  u: URL,
): Promise<void> {
  const fresh = u.searchParams.get("fresh") === "1";
  const payload = await getRepoInsightsCached(fresh);
  sendJsonCacheable(req, res, payload.ok ? 200 : 500, payload);
}
