import type { GhRepo } from "../../../types/github";

export interface SeriesPoint {
  /** Epoch milliseconds. */
  t: number;
  stars: number;
}

export interface RepoSeries {
  /** nameWithOwner. */
  repo: string;
  color: string;
  /** Latest star count in the window. */
  latest: number;
  /** Stars gained across the window (latest − first). */
  delta: number;
  points: SeriesPoint[];
}

export interface Domain {
  minT: number;
  maxT: number;
  minStars: number;
  maxStars: number;
}

/** Distinct palette; cycles if there are more series than colors. */
const PALETTE = [
  "#2ee6c3",
  "#f59e0b",
  "#8b5cf6",
  "#ef4444",
  "#3b82f6",
  "#10b981",
  "#ec4899",
  "#eab308",
  "#14b8a6",
  "#f97316",
  "#a855f7",
  "#06b6d4",
];

export function colorForIndex(index: number): string {
  return PALETTE[index % PALETTE.length] ?? "#2ee6c3";
}

/**
 * Build per-repo star series from snapshot history, sorted by latest stars
 * descending and assigned a stable color by rank. Repos with fewer than two
 * usable history points are dropped (nothing to plot).
 */
export function buildRepoSeries(repos: GhRepo[]): RepoSeries[] {
  const built = repos.flatMap((repo) => {
    const points = (repo.history ?? [])
      .map((entry) => ({ t: Date.parse(entry.date), stars: entry.stars }))
      .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.stars))
      .sort((a, b) => a.t - b.t);
    const first = points[0];
    const last = points[points.length - 1];
    if (!first || !last || points.length < 2) return [];
    return [
      {
        repo: repo.nameWithOwner,
        points,
        latest: last.stars,
        delta: last.stars - first.stars,
      },
    ];
  });

  built.sort((a, b) => b.latest - a.latest);
  return built.map((series, index) => ({ ...series, color: colorForIndex(index) }));
}

/** Combined min/max bounds across the given series, or null if none have points. */
export function seriesDomain(series: RepoSeries[]): Domain | null {
  let minT = Number.POSITIVE_INFINITY;
  let maxT = Number.NEGATIVE_INFINITY;
  let minStars = Number.POSITIVE_INFINITY;
  let maxStars = Number.NEGATIVE_INFINITY;
  for (const entry of series) {
    for (const point of entry.points) {
      if (point.t < minT) minT = point.t;
      if (point.t > maxT) maxT = point.t;
      if (point.stars < minStars) minStars = point.stars;
      if (point.stars > maxStars) maxStars = point.stars;
    }
  }
  if (!Number.isFinite(minT) || !Number.isFinite(minStars)) return null;
  return { minT, maxT, minStars, maxStars };
}

/** Map a star count to a y pixel (0 = top), linear or log10. */
export function scaleStars(stars: number, domain: Domain, height: number, log: boolean): number {
  if (log) {
    const lo = Math.log10(Math.max(1, domain.minStars));
    const hi = Math.log10(Math.max(1, domain.maxStars));
    const range = Math.max(hi - lo, 1e-9);
    return height - ((Math.log10(Math.max(1, stars)) - lo) / range) * height;
  }
  const range = Math.max(domain.maxStars - domain.minStars, 1);
  return height - ((stars - domain.minStars) / range) * height;
}

/** SVG path `d` for one series in a `width`×`height` plot box. */
export function seriesPath(
  series: RepoSeries,
  domain: Domain,
  width: number,
  height: number,
  log: boolean,
): string {
  const tRange = Math.max(domain.maxT - domain.minT, 1);
  return series.points
    .map((point, index) => {
      const x = ((point.t - domain.minT) / tRange) * width;
      const y = scaleStars(point.stars, domain, height, log);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}
