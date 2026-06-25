import { useEffect, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import type { GhIssue } from "../../types/github";
import { formatNumber } from "../../utils/format";
import { clampPage } from "../../utils/pagination";
import { Pagination } from "../common/Pagination";
import { type SortOption, SortSelect } from "../common/SortSelect";
import { StatCard } from "../common/StatCard";
import { IssueList } from "./IssueList";

/** Sort options offered in the Issues-tab dropdown, in menu order. */
const ISSUE_SORT_OPTIONS: SortOption[] = [
  { value: "updated_desc", label: "sort.recentlyUpdated" },
  { value: "updated_asc", label: "sort.leastRecentlyUpdated" },
  { value: "created_desc", label: "sort.newest" },
  { value: "created_asc", label: "sort.oldest" },
  { value: "comments_desc", label: "sort.mostCommented" },
  { value: "comments_asc", label: "sort.leastCommented" },
  { value: "repo_asc", label: "sort.repositoryAZ" },
];

interface IssuesPanelProps {
  /** Issues already filtered + sorted by the parent (shared with footer/sidebar). */
  issues: GhIssue[];
  sort: string;
  onSortChange: (value: string) => void;
  /** Changes whenever the issue filters change; resets pagination to page 1. */
  resetKey: unknown;
}

/**
 * The Issues tab: summary stats, sort toolbar, list, and pagination. Owns its
 * own page / page-size state (used nowhere else) and persists the page size. The
 * parent supplies the already-filtered list and the shared sort value, and bumps
 * `resetKey` on filter changes so the view snaps back to the first page.
 */
export function IssuesPanel({ issues, sort, onSortChange, resetKey }: IssuesPanelProps) {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(
    () => Number(localStorage.getItem("gh-dash.issuesPageSize")) || 20,
  );
  useEffect(() => {
    localStorage.setItem("gh-dash.issuesPageSize", String(pageSize));
  }, [pageSize]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: resetKey is the intentional trigger — snap to page 1 whenever the parent's filters change
  useEffect(() => setPage(1), [resetKey]);

  const pageSafe = clampPage(page, issues.length, pageSize);
  const visibleIssues = issues.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  return (
    <div className="view-issues" style={{ display: "block" }}>
      <section className="stats">
        <StatCard
          label={t("stats.openIssues")}
          value={formatNumber(issues.length)}
          sub={t("stats.matchingFilters")}
        />
        <StatCard
          label={t("stats.repositories")}
          value={new Set(issues.map((issue) => issue.repository.nameWithOwner)).size}
          sub={t("stats.withOpenIssues")}
        />
        <StatCard
          label={t("stats.organizations")}
          value={new Set(issues.map((issue) => issue.repository.nameWithOwner.split("/")[0])).size}
          sub={t("stats.includingPersonal")}
        />
        <StatCard
          label={t("stats.stale30")}
          value={
            issues.filter(
              (issue) => Date.now() - new Date(issue.updatedAt).getTime() > 30 * 86_400_000,
            ).length
          }
          sub={t("stats.noRecentActivity")}
        />
      </section>
      <div className="toolbar">
        <div className="spacer" />
        <SortSelect
          id="issues-sort"
          value={sort}
          options={ISSUE_SORT_OPTIONS}
          onChange={onSortChange}
        />
      </div>
      <IssueList issues={visibleIssues} />
      <Pagination
        totalItems={issues.length}
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
