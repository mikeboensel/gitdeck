import { type Dispatch, type SetStateAction, useMemo } from "react";
import { LuBuilding2, LuGitBranch, LuServer } from "react-icons/lu";
import { Avatar } from "../components/common/Avatar";
import type { FacetGroup } from "../components/sidebar/FacetSidebar";
import { toggleSetValue } from "../components/sidebar/primitives";
import { useI18n } from "../i18n/I18nProvider";
import type { GhIssue, GhPullRequest, GhRepo, LocalRepo, RepoInsight } from "../types/github";
import {
  buildIssueFacets,
  buildPullRequestFacets,
  buildRepoFacets,
  filterIssues,
  filterPullRequests,
  filterRepos,
  type IssueFilters,
  type PullRequestFilters,
  type RepoFilters,
  sortIssues,
  sortPullRequests,
  sortRepos,
} from "../utils/dashboard";
import {
  buildLocalFacets,
  filterLocalRepos,
  type LocalRepoFilters,
  shortRemote,
} from "../utils/localRepos";

interface UseFilteredDashboardOptions {
  issues: GhIssue[];
  pullRequests: GhPullRequest[];
  repos: GhRepo[];
  localRepos: LocalRepo[];
  collaboratorsByRepo: Map<string, string[]>;
  repoInsights: RepoInsight[];
  userLogin: string;
  issueFilters: IssueFilters;
  prFilters: PullRequestFilters;
  repoFilters: RepoFilters;
  localFilters: LocalRepoFilters;
  issueSort: string;
  prSort: string;
  repoSort: string;
  /** Needed so the local facet groups can wire their toggle/clear callbacks. */
  setLocalFilters: Dispatch<SetStateAction<LocalRepoFilters>>;
}

/**
 * Turns the raw fetched collections plus the active filter/sort/facet state into
 * the render-ready view-model the dashboard tabs consume: per-tab facet options,
 * filtered+sorted lists, and the insight projections used by the repo panels.
 *
 * Pure derivation — no fetching or state ownership. `reposByName`/`repoModal`
 * stay in `App` (they key off route params, not filters), as does the raw state.
 */
export function useFilteredDashboard({
  issues,
  pullRequests,
  repos,
  localRepos,
  collaboratorsByRepo,
  repoInsights,
  userLogin,
  issueFilters,
  prFilters,
  repoFilters,
  localFilters,
  issueSort,
  prSort,
  repoSort,
  setLocalFilters,
}: UseFilteredDashboardOptions) {
  const { t } = useI18n();

  const issueFacets = useMemo(() => buildIssueFacets(issues), [issues]);
  const prFacets = useMemo(() => buildPullRequestFacets(pullRequests), [pullRequests]);
  const repoFacets = useMemo(
    () => buildRepoFacets(repos, collaboratorsByRepo),
    [repos, collaboratorsByRepo],
  );
  const localFacets = useMemo(() => buildLocalFacets(localRepos), [localRepos]);
  const filteredLocalRepos = useMemo(
    () => filterLocalRepos(localRepos, localFilters),
    [localRepos, localFilters],
  );
  const localFacetGroups = useMemo<FacetGroup[]>(
    () => [
      {
        key: "owners",
        title: t("local.facetOwner"),
        icon: <LuBuilding2 size={16} />,
        entries: [...localFacets.owners.entries()],
        selected: localFilters.owners,
        onToggle: (v) => setLocalFilters((f) => ({ ...f, owners: toggleSetValue(f.owners, v) })),
        onClear: () => setLocalFilters((f) => ({ ...f, owners: new Set() })),
        render: "chips",
        renderIcon: (name) => <Avatar login={name} size={40} className="facet-chip-avatar" />,
      },
      {
        key: "hosts",
        title: t("local.facetHost"),
        icon: <LuServer size={16} />,
        entries: [...localFacets.hosts.entries()],
        selected: localFilters.hosts,
        onToggle: (v) => setLocalFilters((f) => ({ ...f, hosts: toggleSetValue(f.hosts, v) })),
        onClear: () => setLocalFilters((f) => ({ ...f, hosts: new Set() })),
      },
      {
        key: "remotes",
        title: t("local.facetRemote"),
        icon: <LuGitBranch size={16} />,
        entries: [...localFacets.remotes.entries()],
        selected: localFilters.remotes,
        labelFor: shortRemote,
        onToggle: (v) => setLocalFilters((f) => ({ ...f, remotes: toggleSetValue(f.remotes, v) })),
        onClear: () => setLocalFilters((f) => ({ ...f, remotes: new Set() })),
      },
    ],
    [localFacets, localFilters, t, setLocalFilters],
  );
  const insightsByRepo = useMemo(
    () => new Map(repoInsights.map((insight) => [insight.repo, insight])),
    [repoInsights],
  );
  const filteredIssues = useMemo(
    () => sortIssues(filterIssues(issues, issueFilters, userLogin), issueSort),
    [issues, issueFilters, issueSort, userLogin],
  );
  const filteredPullRequests = useMemo(
    () => sortPullRequests(filterPullRequests(pullRequests, prFilters, userLogin), prSort),
    [pullRequests, prFilters, prSort, userLogin],
  );
  const filteredRepos = useMemo(
    () => sortRepos(filterRepos(repos, issues, repoFilters, collaboratorsByRepo), issues, repoSort),
    [repos, issues, repoFilters, repoSort, collaboratorsByRepo],
  );
  // Repos hidden solely because archived repos are excluded by default — i.e.
  // how many more would show if "Include archived" were on. Surfaced in the
  // footer so the shown/total gap is self-explanatory.
  const archivedHiddenCount = useMemo(() => {
    if (repoFilters.includeArchived) return 0;
    const withArchived = filterRepos(
      repos,
      issues,
      { ...repoFilters, includeArchived: true },
      collaboratorsByRepo,
    );
    return withArchived.length - filteredRepos.length;
  }, [repos, issues, repoFilters, collaboratorsByRepo, filteredRepos.length]);
  const filteredInsights = useMemo(
    () =>
      filteredRepos
        .map((repo) => insightsByRepo.get(repo.nameWithOwner))
        .filter((value): value is RepoInsight => Boolean(value))
        .filter(
          (insight) =>
            insight.issueCount > 0 ||
            insight.securityAlertsCount > 0 ||
            insight.viewsCount > 0 ||
            insight.totalDownloads > 0,
        ),
    [filteredRepos, insightsByRepo],
  );
  const securityInsights = useMemo(
    () =>
      filteredRepos
        .map((repo) => insightsByRepo.get(repo.nameWithOwner))
        .filter((value): value is RepoInsight => Boolean(value))
        .filter((insight) => insight.securityAlertsCount > 0),
    [filteredRepos, insightsByRepo],
  );

  return {
    issueFacets,
    prFacets,
    repoFacets,
    filteredLocalRepos,
    localFacetGroups,
    insightsByRepo,
    filteredIssues,
    filteredPullRequests,
    filteredRepos,
    archivedHiddenCount,
    filteredInsights,
    securityInsights,
  };
}
