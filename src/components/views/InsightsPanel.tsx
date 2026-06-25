import { useI18n } from "../../i18n/I18nProvider";
import type { CommitActivityData, GhRepo, RepoInsight } from "../../types/github";
import { formatNumber } from "../../utils/format";
import { StatCard } from "../common/StatCard";
import { CommitActivityChart } from "./CommitActivityChart";
import { InsightsView } from "./InsightsView";

interface InsightsPanelProps {
  /** All insights — the summary stats are computed over the full set. */
  repoInsights: RepoInsight[];
  /** Insights after filtering, shown in the list. */
  insights: RepoInsight[];
  commitActivity: CommitActivityData | null;
  reposByName: Map<string, GhRepo>;
  onRepoClick: (repo: GhRepo) => void;
}

/**
 * The Insights tab: commit-activity chart, summary stats over all insights, and
 * the per-repo insights list. Stats derive from the raw `repoInsights`; metrics
 * whose fetch failed (`errors`) are excluded so a failed read never skews a sum.
 */
export function InsightsPanel({
  repoInsights,
  insights,
  commitActivity,
  reposByName,
  onRepoClick,
}: InsightsPanelProps) {
  const { t } = useI18n();
  const totalOpenIssues = repoInsights.reduce((sum, insight) => sum + insight.issueCount, 0);
  const reposWithIssuesCount = repoInsights.filter((insight) => insight.issueCount > 0).length;
  const totalViews = repoInsights.reduce(
    (sum, insight) => (insight.errors?.views ? sum : sum + insight.viewsCount),
    0,
  );
  const totalReleaseDownloads = repoInsights.reduce(
    (sum, insight) => (insight.errors?.downloads ? sum : sum + insight.totalDownloads),
    0,
  );
  const viewsKnownCount = repoInsights.filter((insight) => !insight.errors?.views).length;
  const downloadsKnownCount = repoInsights.filter((insight) => !insight.errors?.downloads).length;

  return (
    <div className="view-insights" style={{ display: "block" }}>
      <CommitActivityChart data={commitActivity} />
      <section className="stats">
        <StatCard
          title={t("tip.totalOpenIssues")}
          label={t("stats.openIssues")}
          value={formatNumber(totalOpenIssues)}
          sub={t("stats.acrossShown")}
        />
        <StatCard
          title={t("tip.reposWithOpenIssues")}
          label={t("stats.reposWithOpenIssues")}
          value={formatNumber(reposWithIssuesCount)}
          sub={t("stats.withOpenIssues")}
        />
        <StatCard
          title={t("tip.totalViews")}
          label={t("stats.totalViews")}
          value={viewsKnownCount ? formatNumber(totalViews) : "—"}
          sub={t("stats.last14Days")}
        />
        <StatCard
          title={t("tip.totalDownloads")}
          label={t("stats.totalDownloads")}
          value={downloadsKnownCount ? formatNumber(totalReleaseDownloads) : "—"}
          sub={t("stats.acrossReleaseAssets")}
        />
      </section>
      <InsightsView insights={insights} reposByName={reposByName} onRepoClick={onRepoClick} />
    </div>
  );
}
