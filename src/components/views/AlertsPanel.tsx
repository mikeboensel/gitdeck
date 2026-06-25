import { useI18n } from "../../i18n/I18nProvider";
import type { GhRepo, RepoInsight } from "../../types/github";
import { formatNumber } from "../../utils/format";
import { StatCard } from "../common/StatCard";
import { InsightsView } from "./InsightsView";

interface AlertsPanelProps {
  /** All insights — alert summary stats are computed over the full set. */
  repoInsights: RepoInsight[];
  /** Insights with security alerts, shown in the list. */
  securityInsights: RepoInsight[];
  reposByName: Map<string, GhRepo>;
  onRepoClick: (repo: GhRepo) => void;
}

/**
 * The Security Alerts tab: alert summary stats plus the affected-repos list.
 * Repos whose alert fetch failed (`errors.security`) are counted separately as
 * "unavailable" and excluded from the alert total.
 */
export function AlertsPanel({
  repoInsights,
  securityInsights,
  reposByName,
  onRepoClick,
}: AlertsPanelProps) {
  const { t } = useI18n();
  const totalSecurityAlerts = repoInsights.reduce(
    (sum, insight) => (insight.errors?.security ? sum : sum + insight.securityAlertsCount),
    0,
  );
  const securityRepoCount = repoInsights.filter(
    (insight) => insight.securityAlertsCount > 0,
  ).length;
  const securityUnavailableCount = repoInsights.filter(
    (insight) => insight.errors?.security,
  ).length;
  const securityOpenIssues = securityInsights.reduce((sum, insight) => sum + insight.issueCount, 0);

  return (
    <div className="view-alerts" style={{ display: "block" }}>
      <section className="stats">
        <StatCard
          title={t("tip.totalSecurityAlerts")}
          label={t("alerts.totalAlerts")}
          value={formatNumber(totalSecurityAlerts)}
          sub={t("alerts.affectedRepos", { count: formatNumber(securityRepoCount) })}
        />
        <StatCard
          title={t("tip.reposAffected")}
          label={t("alerts.reposWithAlerts")}
          value={formatNumber(securityRepoCount)}
          sub={t("alerts.securityFocusedView")}
        />
        <StatCard
          title={t("tip.alertsUnavailable")}
          label={t("stats.alertsUnavailable")}
          value={formatNumber(securityUnavailableCount)}
          sub={t("stats.couldNotLoad")}
        />
        <StatCard
          title={t("tip.affectedOpenIssues")}
          label={t("stats.openIssues")}
          value={formatNumber(securityOpenIssues)}
          sub={t("alerts.onAffectedRepos")}
        />
      </section>
      <InsightsView
        insights={securityInsights}
        reposByName={reposByName}
        onRepoClick={onRepoClick}
        emptyTitleKey="alerts.emptyTitle"
        emptyTextKey="alerts.emptyText"
      />
    </div>
  );
}
