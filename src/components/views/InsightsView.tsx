import { useI18n } from "../../i18n/I18nProvider";
import type { GhRepo, RepoInsight } from "../../types/github";
import { formatRelativeTime } from "../../utils/format";
import { metricChip } from "../../utils/metricDisplay";

interface InsightsViewProps {
  insights: RepoInsight[];
  reposByName: Map<string, GhRepo>;
  onRepoClick: (repo: GhRepo) => void;
  emptyTitleKey?: "insights.emptyTitle" | "alerts.emptyTitle";
  emptyTextKey?: "insights.emptyText" | "alerts.emptyText";
}

export function InsightsView({
  insights,
  reposByName,
  onRepoClick,
  emptyTitleKey = "insights.emptyTitle",
  emptyTextKey = "insights.emptyText",
}: InsightsViewProps) {
  const { language, t } = useI18n();
  if (!insights.length) {
    return (
      <div className="empty">
        <div className="big">{t(emptyTitleKey)}</div>
        <div>{t(emptyTextKey)}</div>
      </div>
    );
  }

  return (
    <div className="insights-list">
      {insights.map((insight) => {
        const repo = reposByName.get(insight.repo);
        if (!repo) return null;
        return (
          <article
            className="insight-card"
            key={insight.repo}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: intentionally keyboard-focusable card (see .insight-card:focus-visible); holds heading/paragraph flow content, so it cannot be a native <button>
            tabIndex={0}
            onClick={() => onRepoClick(repo)}
            onKeyDown={(event) => event.key === "Enter" && onRepoClick(repo)}
          >
            <div className="insight-head">
              <strong>{insight.repo}</strong>
            </div>
            <div className="insight-meta">
              <span className="tip" data-tip={t("tip.openIssues")}>
                {t("insights.openIssues", { count: insight.issueCount })}
              </span>
              <span className="tip" data-tip={t("tip.staleIssues")}>
                {t("insights.stale", { count: insight.staleIssueCount })}
              </span>
              {[
                metricChip(insight.viewsCount, "insights.views", "tip.views", t),
                metricChip(insight.totalDownloads, "insights.downloads", "tip.downloads", t),
                metricChip(
                  insight.recentDownloads,
                  "insights.recentDownloads",
                  "tip.recentDownloads",
                  t,
                ),
              ].map((chip) => (
                <span
                  key={chip.text}
                  className={chip.known ? "tip" : "unknown tip"}
                  data-tip={chip.title}
                >
                  {chip.text}
                </span>
              ))}
              {(() => {
                // Show the security chip only when it carries signal: a real count
                // (>0) or unknown (-1). A confirmed clean 0 stays uncluttered.
                if (insight.securityAlertsCount === 0) return null;
                const chip = metricChip(
                  insight.securityAlertsCount,
                  "insights.securityAlerts",
                  "tip.securityAlerts",
                  t,
                );
                return (
                  <span className={chip.known ? "tip" : "unknown tip"} data-tip={chip.title}>
                    {chip.text}
                  </span>
                );
              })()}
              <span className="tip" data-tip={t("tip.pushed")}>
                {t("repo.pushed", {
                  time: repo.pushedAt
                    ? formatRelativeTime(repo.pushedAt, Date.now(), language)
                    : "-",
                })}
              </span>
            </div>
          </article>
        );
      })}
    </div>
  );
}
