import type { IssueFilters, PullRequestFilters, RepoFilters } from "./dashboard";
import type { LocalRepoFilters } from "./localRepos";

/**
 * Count of active filter selections per tab, surfaced in the footer status bar.
 * Each counts facet selections plus any non-default toggles, so "0" means the
 * unfiltered default view.
 */

/** Repo facets (orgs/languages/collaborators) plus the visibility/forks/archived toggles. */
export function countRepoFilters(f: RepoFilters): number {
  return (
    f.orgs.size +
    f.languages.size +
    f.collaborators.size +
    (f.visibility !== "all" ? 1 : 0) +
    (f.includeForks ? 0 : 1) +
    (f.includeArchived ? 1 : 0)
  );
}

/** Issue facets: orgs, repos, labels, authors, assignees. */
export function countIssueFilters(f: IssueFilters): number {
  return f.orgs.size + f.repos.size + f.labels.size + f.authors.size + f.assignees.size;
}

/** PR facets: orgs, repos, labels, authors, assignees. */
export function countPrFilters(f: PullRequestFilters): number {
  return f.orgs.size + f.repos.size + f.labels.size + f.authors.size + f.assignees.size;
}

/** Local-repo facets (owners/hosts/remotes) plus the non-default git-status filter. */
export function countLocalFilters(f: LocalRepoFilters): number {
  return f.owners.size + f.hosts.size + f.remotes.size + (f.status !== "all" ? 1 : 0);
}
