import type { GhIssue, GhRepo, RepoInsight, RepoInsightErrors } from "../types/github";

const DAY_MS = 86_400_000;

export interface RepoInsightInput {
  repo: GhRepo;
  issues: GhIssue[];
  viewsCount?: number;
  viewsUniques?: number;
  releaseCount?: number;
  totalDownloads?: number;
  recentDownloads?: number;
  latestReleasePublishedAt?: string | null;
  securityAlertsCount?: number;
  /** Reasons individual metric groups could not be read; omitted when all loaded. */
  errors?: RepoInsightErrors;
  now?: number;
}

function historyDelta(repo: GhRepo, field: "stars" | "forks"): number | null {
  const history = repo.history || [];
  if (history.length < 2) return null;
  return history[history.length - 1]![field] - history[0]![field];
}

/**
 * Aggregates factual GitHub signals for a repository (open/stale issues, traffic,
 * release downloads, security alerts). No scoring or heuristics — every field is a
 * raw count or a transparent date-based derivation, surfaced as-is in the UI.
 */
export function buildRepoInsight(input: RepoInsightInput): RepoInsight {
  const now = input.now ?? Date.now();
  const repoIssues = input.issues.filter(
    (issue) => issue.repository.nameWithOwner === input.repo.nameWithOwner,
  );
  const staleIssueCount = repoIssues.filter(
    (issue) => now - new Date(issue.updatedAt).getTime() > 30 * DAY_MS,
  ).length;
  const daysSincePush = Math.floor((now - new Date(input.repo.pushedAt).getTime()) / DAY_MS);
  const daysSinceUpdate = Math.floor((now - new Date(input.repo.updatedAt).getTime()) / DAY_MS);

  return {
    repo: input.repo.nameWithOwner,
    issueCount: repoIssues.length,
    staleIssueCount,
    daysSincePush,
    daysSinceUpdate,
    starsDelta: historyDelta(input.repo, "stars"),
    forksDelta: historyDelta(input.repo, "forks"),
    releaseCount: input.releaseCount ?? 0,
    totalDownloads: input.totalDownloads ?? 0,
    recentDownloads: input.recentDownloads ?? 0,
    viewsCount: input.viewsCount ?? 0,
    viewsUniques: input.viewsUniques ?? 0,
    securityAlertsCount: input.securityAlertsCount ?? 0,
    latestReleasePublishedAt: input.latestReleasePublishedAt ?? null,
    ...(input.errors && Object.keys(input.errors).length ? { errors: input.errors } : {}),
  };
}
