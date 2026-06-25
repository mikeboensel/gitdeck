import type { LocalRepo } from "../types/github";
import { arrangeLocalRepos, assessSafety, type LocalUnit, type RepoSafety } from "./localRepos";

/** Stable key/label for the aggregated tail wedge. */
export const OTHER_KEY = "__other__";
const OTHER_COLOR = "#6e7280";

/**
 * Categorical palette for the donut, assigned by wedge order (largest first) so
 * the biggest slices always get maximally-distinct hues. Hash-by-name coloring
 * collides too easily (several repos landing on near-identical pinks); a fixed,
 * hand-ordered qualitative palette keeps adjacent slices readable. Length matches
 * {@link TOP_N}; "Other" uses {@link OTHER_COLOR}.
 */
const DISK_PALETTE = [
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#ec4899", // pink
  "#10b981", // emerald
  "#a855f7", // purple
  "#ef4444", // red
  "#14b8a6", // teal
  "#eab308", // yellow
  "#6366f1", // indigo
  "#84cc16", // lime
  "#f97316", // orange
  "#06b6d4", // cyan
];

/** Max individually-charted repos before the rest collapse into "Other". */
export const TOP_N = 12;

/** One slice of the disk-usage donut. */
export interface DiskWedge {
  /** Unit key, or OTHER_KEY for the aggregated tail. */
  key: string;
  /** Display name (repo name, or "Other"). */
  name: string;
  /** Total bytes for this wedge. */
  bytes: number;
  /** Wedge color (deterministic per name; grey for Other). */
  color: string;
  /** The cluster this wedge represents; null for the aggregated Other wedge. */
  unit: LocalUnit | null;
  /** Safe-delete assessment; null for the Other wedge. */
  safety: RepoSafety | null;
}

export interface DiskUsageModel {
  /** Wedges in descending size order, with Other (when present) last. */
  wedges: DiskWedge[];
  /** Sum of all measured repo sizes (excludes unmeasured). */
  totalBytes: number;
  /** How many clusters had a measurable size. */
  measuredCount: number;
  /** How many repos had sizeBytes == null (excluded from the chart). */
  unmeasuredCount: number;
  /** How many clusters were folded into the Other wedge (0 when not truncated). */
  otherCount: number;
}

/**
 * Total on-disk bytes of a cluster: the primary checkout (its `du` already
 * includes the shared `.git` object store) plus each authoritative linked
 * worktree's working tree. Uses `git worktree list` sizes — not scan-discovered
 * checkouts — so worktrees outside the scan roots are still counted. Null when
 * nothing measured.
 */
function unitBytes(unit: LocalUnit): number | null {
  let sum = 0;
  let measured = false;
  if (unit.primary.sizeBytes != null) {
    sum += unit.primary.sizeBytes;
    measured = true;
  }
  for (const w of unit.primary.linkedWorktrees) {
    if (w.sizeBytes != null) {
      sum += w.sizeBytes;
      measured = true;
    }
  }
  return measured ? sum : null;
}

/**
 * Build the disk-usage donut model from a (facet-filtered) repo list. Worktrees
 * are clustered into units; each measured unit becomes a wedge. The top
 * {@link TOP_N} by size are charted individually and the remainder are summed
 * into a single "Other" wedge so the chart stays legible with hundreds of repos.
 * Units with no measurable size are excluded and counted in `unmeasuredCount`.
 */
export function buildDiskUsage(repos: LocalRepo[]): DiskUsageModel {
  const units = arrangeLocalRepos(repos, "size_desc");

  const measured: { unit: LocalUnit; bytes: number }[] = [];
  let unmeasuredCount = 0;
  for (const unit of units) {
    const bytes = unitBytes(unit);
    if (bytes == null) {
      unmeasuredCount += 1;
      continue;
    }
    measured.push({ unit, bytes });
  }

  // arrangeLocalRepos already sorted by size_desc, but a cluster's summed bytes
  // can reorder vs the primary's own size — re-sort on the unit total to be exact.
  measured.sort(
    (a, b) => b.bytes - a.bytes || a.unit.primary.path.localeCompare(b.unit.primary.path),
  );

  const totalBytes = measured.reduce((sum, m) => sum + m.bytes, 0);

  const head = measured.slice(0, TOP_N);
  const tail = measured.slice(TOP_N);

  const wedges: DiskWedge[] = head.map(({ unit, bytes }, index) => ({
    key: unit.key,
    name: unit.primary.name,
    bytes,
    color: DISK_PALETTE[index % DISK_PALETTE.length] ?? OTHER_COLOR,
    unit,
    safety: assessSafety(unit),
  }));

  if (tail.length > 0) {
    wedges.push({
      key: OTHER_KEY,
      name: "Other",
      bytes: tail.reduce((sum, m) => sum + m.bytes, 0),
      color: OTHER_COLOR,
      unit: null,
      safety: null,
    });
  }

  return {
    wedges,
    totalBytes,
    measuredCount: measured.length,
    unmeasuredCount,
    otherCount: tail.length,
  };
}
