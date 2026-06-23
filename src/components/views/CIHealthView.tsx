import { useMemo, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import type { GhRepo, RepoCIHealth } from "../../types/github";
import { formatNumber, formatRelativeTime } from "../../utils/format";
import { type SortOption, SortSelect } from "../common/SortSelect";

type SortKey =
  | "health_asc"
  | "health_desc"
  | "failures_desc"
  | "runs_desc"
  | "recent_failure"
  | "name_asc";

const CI_SORT_OPTIONS: SortOption[] = [
  { value: "health_asc", label: "sort.mostAtRisk" },
  { value: "health_desc", label: "sort.bestHealth" },
  { value: "failures_desc", label: "sort.mostFailures" },
  { value: "recent_failure", label: "sort.recentFailureFirst" },
  { value: "runs_desc", label: "sort.mostRuns" },
  { value: "name_asc", label: "sort.nameAZ" },
];

interface CIHealthViewProps {
  data: RepoCIHealth[];
  reposByName: Map<string, GhRepo>;
  onRepoClick: (repo: GhRepo) => void;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${h}h ${mm}m` : `${h}h`;
}

function healthLabel(rate: number, totalDecided: number): string {
  if (totalDecided === 0) return "no data";
  if (rate >= 0.95) return "strong";
  if (rate >= 0.75) return "watch";
  return "risky";
}

export function CIHealthView({ data, reposByName, onRepoClick }: CIHealthViewProps) {
  const { language, t } = useI18n();
  const [sort, setSort] = useState<SortKey>("health_asc");

  const sorted = useMemo(() => {
    const list = [...data];
    list.sort((a, b) => {
      switch (sort) {
        case "health_asc":
          return a.successRate - b.successRate || b.failureCount - a.failureCount;
        case "health_desc":
          return b.successRate - a.successRate || a.failureCount - b.failureCount;
        case "failures_desc":
          return b.failureCount - a.failureCount;
        case "runs_desc":
          return b.totalRuns - a.totalRuns;
        case "recent_failure": {
          const ax = a.lastFailure ? Date.parse(a.lastFailure.createdAt) : 0;
          const bx = b.lastFailure ? Date.parse(b.lastFailure.createdAt) : 0;
          return bx - ax;
        }
        case "name_asc":
          return a.repo.localeCompare(b.repo);
        default:
          return 0;
      }
    });
    return list;
  }, [data, sort]);

  if (!data.length) {
    return (
      <div className="empty">
        <div className="big">{t("ci.noActivity")}</div>
        <div>{t("ci.noActivityText")}</div>
      </div>
    );
  }

  return (
    <div className="view-ci-health">
      <div className="toolbar">
        <span className="count-chip">{t("ci.repositoriesCount", { count: sorted.length })}</span>
        <div className="spacer" />
        <SortSelect
          id="ci-sort"
          value={sort}
          options={CI_SORT_OPTIONS}
          onChange={(value) => setSort(value as SortKey)}
        />
      </div>
      <table className="ci-table">
        <tbody>
          <tr className="ci-row ci-row-head">
            <th scope="col">{t("stats.repositories")}</th>
            <th scope="col">{t("ci.successRate")}</th>
            <th scope="col">{t("ci.runs")}</th>
            <th scope="col">{t("ci.avgDuration")}</th>
            <th scope="col">{t("ci.lastRun")}</th>
            <th scope="col">{t("ci.lastFailure")}</th>
          </tr>
          {sorted.map((entry) => {
            const repo = reposByName.get(entry.repo);
            const decided = entry.successCount + entry.failureCount;
            const ratePct = decided ? Math.round(entry.successRate * 100) : 0;
            const label = healthLabel(entry.successRate, decided);
            return (
              <tr className="ci-row" key={entry.repo}>
                <td className="ci-repo" data-label={t("stats.repositories")}>
                  <span className={`ci-health-dot ci-health-${label}`} aria-hidden="true" />
                  <button
                    type="button"
                    className="ci-repo-link tip"
                    onClick={() => repo && onRepoClick(repo)}
                    disabled={!repo}
                    data-tip={entry.repo}
                  >
                    {entry.repo}
                  </button>
                </td>
                <td className="ci-rate" data-label={t("ci.successRate")}>
                  <div className="ci-rate-top">
                    <span className={`ci-rate-pct ci-rate-${label}`}>
                      {decided ? `${ratePct}%` : "—"}
                    </span>
                    <span className="ci-rate-counts">
                      <span className="ci-count ci-count-ok">{entry.successCount}✓</span>
                      <span className="ci-count ci-count-fail">{entry.failureCount}✗</span>
                      {entry.cancelledCount ? (
                        <span className="ci-count">{entry.cancelledCount}⊘</span>
                      ) : null}
                    </span>
                  </div>
                  <div className={`ci-bar ci-bar-${label}`}>
                    <div className="ci-bar-fill" style={{ width: `${decided ? ratePct : 0}%` }} />
                  </div>
                </td>
                <td data-label={t("ci.runs")}>{formatNumber(entry.totalRuns)}</td>
                <td data-label={t("ci.avgDuration")}>{formatDuration(entry.avgDurationSec)}</td>
                <td className="ci-last" data-label={t("ci.lastRun")}>
                  {entry.lastRun ? (
                    <a href={entry.lastRun.url} target="_blank" rel="noopener noreferrer">
                      <span
                        className={`ci-conclusion ${entry.lastRun.conclusion ?? entry.lastRun.status}`}
                      >
                        {entry.lastRun.conclusion ?? entry.lastRun.status}
                      </span>
                      <span className="ci-when">
                        {formatRelativeTime(entry.lastRun.createdAt, Date.now(), language)}
                      </span>
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="ci-last" data-label={t("ci.lastFailure")}>
                  {entry.lastFailure ? (
                    <a href={entry.lastFailure.url} target="_blank" rel="noopener noreferrer">
                      <span className="ci-workflow">{entry.lastFailure.workflowName}</span>
                      <span className="ci-when">
                        {formatRelativeTime(entry.lastFailure.createdAt, Date.now(), language)}
                      </span>
                    </a>
                  ) : (
                    <span className="ci-none">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
