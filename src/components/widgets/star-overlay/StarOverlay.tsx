import { useMemo, useState } from "react";
import { formatNumber } from "../../../utils/format";
import type { WidgetContext } from "../types";
import { buildRepoSeries, seriesDomain, seriesPath } from "./overlay";

/** How many of the most-starred repos render by default. */
const DEFAULT_SELECTED = 6;
/** Cap the toggle legend so 100+ repos don't produce 100+ chips. */
const MAX_LEGEND = 24;

const PLOT_W = 720;
const PLOT_H = 240;
const MARGIN = { top: 10, right: 12, bottom: 26, left: 52 };
const INNER_W = PLOT_W - MARGIN.left - MARGIN.right;
const INNER_H = PLOT_H - MARGIN.top - MARGIN.bottom;

function shortName(nameWithOwner: string): string {
  return nameWithOwner.split("/").pop() ?? nameWithOwner;
}

function formatDate(t: number): string {
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Multi-repo star-history overlay: every selected repo's star curve on one
 * shared time axis, with a log-scale toggle so repos of very different sizes
 * stay legible together. Reuses the snapshot history already on each repo — no
 * new API calls.
 */
export function StarOverlay({ ctx }: { ctx: WidgetContext }) {
  const allSeries = useMemo(() => {
    const repos = ctx.insights
      .map((insight) => ctx.reposByName.get(insight.repo))
      .filter((repo) => repo !== undefined);
    return buildRepoSeries(repos);
  }, [ctx.insights, ctx.reposByName]);

  const legend = allSeries.slice(0, MAX_LEGEND);
  const hiddenCount = allSeries.length - legend.length;

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(allSeries.slice(0, DEFAULT_SELECTED).map((series) => series.repo)),
  );
  const [log, setLog] = useState(false);

  const shown = useMemo(
    () => allSeries.filter((series) => selected.has(series.repo)),
    [allSeries, selected],
  );
  const domain = useMemo(() => seriesDomain(shown), [shown]);

  if (!allSeries.length) {
    return (
      <div className="lab-empty">
        No star history yet. Gitdeck records a daily snapshot per repo — overlays appear once at
        least two days are captured.
      </div>
    );
  }

  const toggle = (repo: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(repo)) next.delete(repo);
      else next.add(repo);
      return next;
    });

  return (
    <div className="star-overlay">
      <div className="star-overlay-controls">
        <button
          type="button"
          className={`star-overlay-scale${log ? " is-active" : ""}`}
          onClick={() => setLog((value) => !value)}
          data-tip="Toggle logarithmic y-axis — keeps repos of very different sizes legible"
        >
          {log ? "Log scale" : "Linear scale"}
        </button>
      </div>

      {domain ? (
        <svg
          className="star-overlay-chart"
          viewBox={`0 0 ${PLOT_W} ${PLOT_H}`}
          role="img"
          aria-label="Star history overlay"
        >
          <text
            className="star-overlay-axis"
            x={MARGIN.left - 6}
            y={MARGIN.top + 8}
            textAnchor="end"
          >
            {formatNumber(domain.maxStars)}
          </text>
          <text
            className="star-overlay-axis"
            x={MARGIN.left - 6}
            y={MARGIN.top + INNER_H}
            textAnchor="end"
          >
            {formatNumber(domain.minStars)}
          </text>
          <text className="star-overlay-axis" x={MARGIN.left} y={PLOT_H - 8} textAnchor="start">
            {formatDate(domain.minT)}
          </text>
          <text
            className="star-overlay-axis"
            x={PLOT_W - MARGIN.right}
            y={PLOT_H - 8}
            textAnchor="end"
          >
            {formatDate(domain.maxT)}
          </text>
          <g transform={`translate(${MARGIN.left} ${MARGIN.top})`}>
            <line className="star-overlay-baseline" x1={0} y1={INNER_H} x2={INNER_W} y2={INNER_H} />
            {shown.map((series) => (
              <path
                key={series.repo}
                className="star-overlay-line"
                d={seriesPath(series, domain, INNER_W, INNER_H, log)}
                stroke={series.color}
                fill="none"
              />
            ))}
          </g>
        </svg>
      ) : (
        <div className="lab-empty">Select a repository below to plot its star history.</div>
      )}

      <div className="star-overlay-legend">
        {legend.map((series) => {
          const on = selected.has(series.repo);
          return (
            <button
              type="button"
              key={series.repo}
              className={`star-overlay-chip${on ? " is-on" : ""}`}
              onClick={() => toggle(series.repo)}
              data-tip={`${series.repo} · ${formatNumber(series.latest)}★ (${
                series.delta >= 0 ? "+" : ""
              }${formatNumber(series.delta)} in range)`}
            >
              <span className="star-overlay-swatch" style={{ background: series.color }} />
              <span className="star-overlay-chip-name">{shortName(series.repo)}</span>
            </button>
          );
        })}
        {hiddenCount > 0 ? (
          <span className="star-overlay-more">
            +{hiddenCount} lower-starred repo{hiddenCount === 1 ? "" : "s"} not shown
          </span>
        ) : null}
      </div>
    </div>
  );
}
