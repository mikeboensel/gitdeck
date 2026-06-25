import { useEffect, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import type { GhPullRequest } from "../../types/github";
import type { PullRequestFilters } from "../../utils/dashboard";
import { formatNumber } from "../../utils/format";
import { clampPage } from "../../utils/pagination";
import { Pagination } from "../common/Pagination";
import { type SortOption, SortSelect } from "../common/SortSelect";
import { StatCard } from "../common/StatCard";
import { PullRequestList } from "./PullRequestList";

/** Sort options offered in the PRs-tab dropdown, in menu order. */
const PR_SORT_OPTIONS: SortOption[] = [
  { value: "updated_desc", label: "sort.recentlyUpdated" },
  { value: "updated_asc", label: "sort.leastRecentlyUpdated" },
  { value: "created_desc", label: "sort.newest" },
  { value: "created_asc", label: "sort.oldest" },
  { value: "review_pending", label: "sort.awaitingReviewFirst" },
  { value: "size_desc", label: "sort.largestDiff" },
  { value: "size_asc", label: "sort.smallestDiff" },
  { value: "files_desc", label: "sort.mostFilesChanged" },
  { value: "comments_desc", label: "sort.mostCommented" },
  { value: "repo_asc", label: "sort.repositoryAZ" },
];

interface PrsPanelProps {
  /** All open PRs — the summary stats are computed over the full set. */
  pullRequests: GhPullRequest[];
  /** PRs after filtering + sorting (shared with footer/sidebar). */
  filtered: GhPullRequest[];
  filters: PullRequestFilters;
  onFiltersChange: (filters: PullRequestFilters) => void;
  sort: string;
  onSortChange: (value: string) => void;
}

/**
 * The PRs tab: summary stats (over all PRs), a preset + sort toolbar, the PR
 * list, and pagination. Owns its own page / page-size state and snaps back to
 * page 1 whenever the shared filters change.
 */
export function PrsPanel({
  pullRequests,
  filtered,
  filters,
  onFiltersChange,
  sort,
  onSortChange,
}: PrsPanelProps) {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(
    () => Number(localStorage.getItem("gh-dash.prsPageSize")) || 20,
  );
  useEffect(() => {
    localStorage.setItem("gh-dash.prsPageSize", String(pageSize));
  }, [pageSize]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: filters is the intentional trigger — snap to page 1 whenever the shared filters change
  useEffect(() => setPage(1), [filters]);

  const pageSafe = clampPage(page, filtered.length, pageSize);
  const visible = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  const draftCount = pullRequests.filter((pr) => pr.isDraft).length;
  const awaitingReviewCount = pullRequests.filter(
    (pr) => !pr.isDraft && pr.reviewsCount === 0,
  ).length;
  const approvedCount = pullRequests.filter((pr) => pr.reviewDecision === "APPROVED").length;
  const stalePrCount = pullRequests.filter(
    (pr) => Date.now() - new Date(pr.updatedAt).getTime() > 14 * 86_400_000,
  ).length;

  return (
    <div className="view-prs" style={{ display: "block" }}>
      <section className="stats">
        <StatCard
          label={t("stats.openPrs")}
          value={formatNumber(filtered.length)}
          sub={t("stats.matchingFilters")}
        />
        <StatCard
          label={t("stats.drafts")}
          value={formatNumber(draftCount)}
          sub={t("stats.acrossAllPrs")}
        />
        <StatCard
          label={t("stats.awaitingReview")}
          value={formatNumber(awaitingReviewCount)}
          sub={t("stats.noReviewYet")}
        />
        <StatCard
          label={t("stats.approved")}
          value={formatNumber(approvedCount)}
          sub={t("stats.readyToMerge")}
        />
        <StatCard
          label={t("stats.stale14")}
          value={formatNumber(stalePrCount)}
          sub={t("stats.noRecentActivity")}
        />
      </section>
      <div className="toolbar">
        <div className="spacer" />
        <label htmlFor="prs-preset">{t("common.preset")}</label>
        <select
          id="prs-preset"
          className="sort"
          value={filters.preset}
          onChange={(event) => onFiltersChange({ ...filters, preset: event.target.value })}
        >
          <option value="">{t("common.all")}</option>
          <option value="ready">{t("preset.ready")}</option>
          <option value="draft">{t("preset.draft")}</option>
          <option value="awaiting-review">{t("preset.awaitingReview")}</option>
          <option value="approved">{t("preset.approved")}</option>
          <option value="changes-requested">{t("preset.changesRequested")}</option>
          <option value="assigned-me">{t("preset.assignedMe")}</option>
          <option value="authored-me">{t("preset.authoredMe")}</option>
          <option value="stale">{t("preset.stale")}</option>
        </select>
        <SortSelect id="prs-sort" value={sort} options={PR_SORT_OPTIONS} onChange={onSortChange} />
      </div>
      <PullRequestList pullRequests={visible} />
      <Pagination
        totalItems={filtered.length}
        page={pageSafe}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    </div>
  );
}
