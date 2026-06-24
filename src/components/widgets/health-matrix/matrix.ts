import type { GhRepo, RepoInsight } from "../../../types/github";

/** Cell verdict. `unknown` means the underlying metric could not be read. */
export type CellState = "ok" | "warn" | "bad" | "unknown";

export interface MatrixDimension {
  key: string;
  /** Full label, shown in the cell tooltip and as the column header tooltip. */
  label: string;
  /** Short column header (the grid is narrow). */
  short: string;
}

export interface MatrixCell {
  dimension: MatrixDimension;
  state: CellState;
  /** Human detail for the tooltip, e.g. "Pushed 12d ago". */
  detail: string;
}

export interface MatrixRow {
  repo: string;
  archived: boolean;
  cells: MatrixCell[];
  /** Sum of cell severities (bad=2, warn=1) — drives worst-first ordering. */
  severity: number;
}

type Grade = Omit<MatrixCell, "dimension">;

const SEVERITY: Record<CellState, number> = { ok: 0, warn: 1, bad: 2, unknown: 0 };

function activity(insight: RepoInsight): Grade {
  const days = insight.daysSincePush;
  const detail = `Pushed ${days}d ago`;
  if (days <= 30) return { state: "ok", detail };
  if (days <= 90) return { state: "warn", detail };
  return { state: "bad", detail };
}

function issues(insight: RepoInsight): Grade {
  const { staleIssueCount, issueCount } = insight;
  const detail = `${staleIssueCount} stale of ${issueCount} open`;
  if (staleIssueCount === 0) return { state: "ok", detail };
  if (staleIssueCount <= 4) return { state: "warn", detail };
  return { state: "bad", detail };
}

function security(insight: RepoInsight): Grade {
  if (insight.errors?.security) return { state: "unknown", detail: insight.errors.security };
  const count = insight.securityAlertsCount;
  const detail = `${count} alert${count === 1 ? "" : "s"}`;
  if (count === 0) return { state: "ok", detail };
  if (count <= 2) return { state: "warn", detail };
  return { state: "bad", detail };
}

function traffic(insight: RepoInsight): Grade {
  if (insight.errors?.views) return { state: "unknown", detail: insight.errors.views };
  const views = insight.viewsCount;
  return views > 0
    ? { state: "ok", detail: `${views} views (14d)` }
    : { state: "warn", detail: "No views in 14d" };
}

function momentum(insight: RepoInsight): Grade {
  const delta = insight.starsDelta;
  if (delta === null) return { state: "unknown", detail: "No star history" };
  const detail = `${delta > 0 ? "+" : ""}${delta} stars in range`;
  if (delta > 0) return { state: "ok", detail };
  if (delta === 0) return { state: "warn", detail: "Flat" };
  return { state: "bad", detail };
}

/** Columns in display order. Decomposes the single health score into components. */
const COLUMNS: { dimension: MatrixDimension; grade: (insight: RepoInsight) => Grade }[] = [
  { dimension: { key: "activity", label: "Recent activity", short: "Act" }, grade: activity },
  { dimension: { key: "issues", label: "Stale issues", short: "Iss" }, grade: issues },
  { dimension: { key: "security", label: "Security alerts", short: "Sec" }, grade: security },
  { dimension: { key: "traffic", label: "Traffic (14-day views)", short: "Traf" }, grade: traffic },
  { dimension: { key: "momentum", label: "Stars momentum", short: "Star" }, grade: momentum },
];

/** Column dimensions, for rendering the header row. */
export const DIMENSIONS: MatrixDimension[] = COLUMNS.map((column) => column.dimension);

/**
 * Build the health matrix: one row per insight, a cell per dimension, sorted
 * worst-first so systemic problems surface at the top. Archived repos sink to
 * the bottom (their staleness is expected, not actionable).
 */
export function buildHealthMatrix(
  insights: RepoInsight[],
  reposByName: Map<string, GhRepo>,
): MatrixRow[] {
  const rows = insights.map((insight): MatrixRow => {
    const cells = COLUMNS.map((column) => ({
      dimension: column.dimension,
      ...column.grade(insight),
    }));
    return {
      repo: insight.repo,
      archived: reposByName.get(insight.repo)?.isArchived ?? false,
      cells,
      severity: cells.reduce((sum, cell) => sum + SEVERITY[cell.state], 0),
    };
  });

  return rows.sort((a, b) => {
    if (a.archived !== b.archived) return a.archived ? 1 : -1;
    if (a.severity !== b.severity) return b.severity - a.severity;
    return a.repo.localeCompare(b.repo);
  });
}
