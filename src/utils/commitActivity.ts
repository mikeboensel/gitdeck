import type { CommitActivityDay } from "../types/github";

export type CommitGranularity = "day" | "week" | "month";

/** Series key for repos beyond the visible top-N, rolled into one segment. */
export const OTHER_SERIES = "Other";

/** A single stacked bar: a time bucket plus one numeric field per series key. */
export interface CommitChartRow {
  /** Sortable bucket id, also used as the x-axis label (e.g. "2025-06-23", "2025-06"). */
  bucket: string;
  [series: string]: string | number;
}

export interface CommitChartData {
  rows: CommitChartRow[];
  /** Stack/legend order: top-N repos by total, plus OTHER_SERIES when truncated. */
  series: string[];
}

/** ISO day (UTC) of the Monday on or before `date` (YYYY-MM-DD). */
function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0=Sun … 6=Sat
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return d.toISOString().slice(0, 10);
}

/** Map a calendar day to its bucket id for the chosen granularity. */
export function bucketFor(date: string, granularity: CommitGranularity): string {
  if (granularity === "month") return date.slice(0, 7); // YYYY-MM
  if (granularity === "week") return weekStart(date);
  return date;
}

/**
 * Fold sparse per-repo, per-day commit counts into stacked-bar rows. The top
 * `maxSeries` repos (by total over the window) stay as their own segments; the
 * rest are summed into an `OTHER_SERIES` segment so the stack stays readable.
 *
 * @param days  sparse daily records (only days with commits)
 * @param repos repo keys pre-ranked by total commits (desc); used for series order
 */
export function buildCommitChartData(
  days: CommitActivityDay[],
  repos: string[],
  granularity: CommitGranularity,
  maxSeries = 10,
): CommitChartData {
  const top = repos.slice(0, maxSeries);
  const topSet = new Set(top);
  const hasOther = repos.length > top.length;
  const series = hasOther ? [...top, OTHER_SERIES] : top;

  const byBucket = new Map<string, Map<string, number>>();
  for (const { repo, date, count } of days) {
    if (count <= 0) continue;
    const bucket = bucketFor(date, granularity);
    const key = topSet.has(repo) ? repo : OTHER_SERIES;
    let counts = byBucket.get(bucket);
    if (!counts) {
      counts = new Map();
      byBucket.set(bucket, counts);
    }
    counts.set(key, (counts.get(key) ?? 0) + count);
  }

  const rows: CommitChartRow[] = [...byBucket.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([bucket, counts]) => {
      const row: CommitChartRow = { bucket };
      for (const key of series) row[key] = counts.get(key) ?? 0;
      return row;
    });

  return { rows, series };
}
