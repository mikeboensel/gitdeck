import { useI18n } from "../../i18n/I18nProvider";
import type { GhRepo, RepoCIHealth } from "../../types/github";
import { formatNumber } from "../../utils/format";
import { StatCard } from "../common/StatCard";
import { CIHealthView } from "./CIHealthView";

interface CiPanelProps {
  ciHealth: RepoCIHealth[];
  reposByName: Map<string, GhRepo>;
  onRepoClick: (repo: GhRepo) => void;
}

/**
 * The CI Health tab: workflow-run summary stats plus the per-repo health list.
 * The average success rate is computed only over decided runs (success +
 * failure), so still-running or skipped runs never drag it down.
 */
export function CiPanel({ ciHealth, reposByName, onRepoClick }: CiPanelProps) {
  const { t } = useI18n();
  const totalRuns = ciHealth.reduce((sum, entry) => sum + entry.totalRuns, 0);
  const totalFailures = ciHealth.reduce((sum, entry) => sum + entry.failureCount, 0);
  const failingRepos = ciHealth.filter((entry) => entry.failureCount > 0).length;
  const decided = ciHealth.reduce((sum, entry) => sum + entry.successCount + entry.failureCount, 0);
  const successes = ciHealth.reduce((sum, entry) => sum + entry.successCount, 0);
  const avgSuccessPct = decided ? Math.round((successes / decided) * 100) : 0;

  return (
    <div className="view-ci" style={{ display: "block" }}>
      <section className="stats">
        <StatCard
          label={t("stats.reposWithCi")}
          value={formatNumber(ciHealth.length)}
          sub={t("stats.recentWorkflowRuns")}
        />
        <StatCard
          label={t("stats.totalRuns")}
          value={formatNumber(totalRuns)}
          sub={t("stats.lastRunsPerRepo", { count: ciHealth[0]?.totalRuns ?? 30 })}
        />
        <StatCard
          label={t("stats.avgSuccess")}
          value={`${avgSuccessPct}%`}
          sub={t("stats.acrossDecidedRuns")}
        />
        <StatCard
          label={t("stats.failingRepos")}
          value={formatNumber(failingRepos)}
          sub={t("stats.failuresTotal", { count: formatNumber(totalFailures) })}
        />
      </section>
      <CIHealthView data={ciHealth} reposByName={reposByName} onRepoClick={onRepoClick} />
    </div>
  );
}
