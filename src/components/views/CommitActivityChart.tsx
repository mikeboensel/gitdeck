import { lazy, Suspense, useMemo, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import type { TranslationKey } from "../../i18n/translations";
import type { CommitActivityData } from "../../types/github";
import { getLanguageColor } from "../../utils/colors";
import {
  buildCommitChartData,
  type CommitGranularity,
  OTHER_SERIES,
} from "../../utils/commitActivity";

const ChartInner = lazy(() => import("./CommitActivityChartInner"));

const GRANULARITY_LABELS: Record<CommitGranularity, TranslationKey> = {
  day: "insights.activity.day",
  week: "insights.activity.week",
  month: "insights.activity.month",
};
const GRANULARITIES = Object.keys(GRANULARITY_LABELS) as CommitGranularity[];
const OTHER_COLOR = "#6e7280";

interface CommitActivityChartProps {
  /** null while the activity data is still loading. */
  data: CommitActivityData | null;
}

/**
 * "Commits by project" stacked bar chart for the Insights tab. Owns the
 * granularity toggle and empty/loading states; defers the heavy Recharts render
 * to a lazy-loaded inner component.
 */
export function CommitActivityChart({ data }: CommitActivityChartProps) {
  const { t } = useI18n();
  const [granularity, setGranularity] = useState<CommitGranularity>("week");

  const chart = useMemo(
    () => (data ? buildCommitChartData(data.days, data.repos, granularity) : null),
    [data, granularity],
  );

  const colors = useMemo(() => {
    const map: Record<string, string> = { [OTHER_SERIES]: OTHER_COLOR };
    for (const key of chart?.series ?? []) {
      if (key !== OTHER_SERIES) map[key] = getLanguageColor(key);
    }
    return map;
  }, [chart]);

  const seriesLabel = (key: string) =>
    key === OTHER_SERIES ? t("insights.activity.other") : (key.split("/").pop() ?? key);

  const hasData = chart !== null && chart.rows.length > 0;

  return (
    <section className="commit-activity">
      <div className="commit-activity-head">
        <h3 className="commit-activity-title">{t("insights.activity.title")}</h3>
        <div
          className="digest-period-tabs"
          role="tablist"
          aria-label={t("insights.activity.granularityLabel")}
        >
          {GRANULARITIES.map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={granularity === value}
              className={`digest-period-tab${granularity === value ? " active" : ""}`}
              onClick={() => setGranularity(value)}
            >
              {t(GRANULARITY_LABELS[value])}
            </button>
          ))}
        </div>
      </div>
      {!data ? (
        <div className="commit-activity-empty">{t("common.loadingEllipsis")}</div>
      ) : !hasData ? (
        <div className="commit-activity-empty">{t("insights.activity.empty")}</div>
      ) : (
        <Suspense
          fallback={<div className="commit-activity-empty">{t("common.loadingEllipsis")}</div>}
        >
          <ChartInner
            rows={chart.rows}
            series={chart.series}
            colors={colors}
            seriesLabel={seriesLabel}
          />
        </Suspense>
      )}
      <p className="commit-activity-caveat">{t("insights.activity.caveat")}</p>
    </section>
  );
}
