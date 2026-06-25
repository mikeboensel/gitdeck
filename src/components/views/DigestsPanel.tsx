import { useI18n } from "../../i18n/I18nProvider";
import type { DailyDigestEntry, DigestPeriod } from "../../types/github";
import { formatNumber } from "../../utils/format";
import { StatCard } from "../common/StatCard";
import { DailyDigestView } from "./DailyDigestView";

interface DigestsPanelProps {
  digests: DailyDigestEntry[];
  period: DigestPeriod;
  onPeriodChange: (period: DigestPeriod) => void;
}

/** Signed delta string (e.g. "+3", "-2", "0") for the latest digest snapshot. */
const signedDelta = (value: number | undefined) =>
  value === undefined ? "0" : `${value >= 0 ? "+" : ""}${formatNumber(value)}`;

/**
 * The Digests tab: latest-snapshot delta stats plus the historical digest list.
 * Stats read the most recent snapshot (`digests[0]`); the period drives both the
 * labels and the aggregation granularity in {@link DailyDigestView}.
 */
export function DigestsPanel({ digests, period, onPeriodChange }: DigestsPanelProps) {
  const { t } = useI18n();
  const latest = digests[0];
  const vsPrevious = t("stats.vsPrevious", {
    period: period === "day" ? t("period.day") : t(`period.${period}`),
  });

  return (
    <div className="view-digests" style={{ display: "block" }}>
      <section className="stats">
        <StatCard
          label={
            period === "day"
              ? t("stats.digestDays")
              : period === "week"
                ? t("stats.digestWeeks")
                : t("stats.digestMonths")
          }
          value={formatNumber(digests.length)}
          sub={period === "day" ? t("stats.daysWithSavedSnapshots") : t("stats.periodsAggregated")}
        />
        <StatCard
          label={t("stats.latestIssueDelta")}
          value={latest ? signedDelta(latest.issueDelta) : "0"}
          sub={vsPrevious}
        />
        <StatCard
          label={t("stats.latestStarsDelta")}
          value={latest ? signedDelta(latest.starsDelta) : "0"}
          sub={vsPrevious}
        />
        <StatCard
          label={t("stats.latestStaleDelta")}
          value={latest ? signedDelta(latest.staleIssueDelta) : "0"}
          sub={vsPrevious}
        />
        <StatCard
          label={t("alerts.totalAlerts")}
          value={latest ? formatNumber(latest.securityAlertsCount) : "0"}
          sub={
            latest
              ? t("digest.securityRepos", { count: formatNumber(latest.securityReposCount) })
              : t("digest.securityUnavailable")
          }
        />
      </section>
      <DailyDigestView digests={digests} period={period} onPeriodChange={onPeriodChange} />
    </div>
  );
}
