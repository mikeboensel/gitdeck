/**
 * Central tunables for the commit-history feature. Both the backend walk
 * (`server/localHistoryCache.ts`, `server/routes/localRepoHistory.ts`) and the
 * frontend graph (`utils/commitGraph.ts`, `components/CommitHistoryModal.tsx`)
 * import from here, so every "magic number" for the feature lives in one place.
 *
 * Pure data + one tiny helper — no node/browser APIs — so it's safe to import on
 * either side of the wire.
 */

// ── Backend git walk ─────────────────────────────────────────────────────────
/** Per-git-invocation timeout. */
export const GIT_TIMEOUT_MS = 10_000;
/** Max stdout captured from a git invocation (large histories/diffs). */
export const GIT_MAX_BUFFER = 8 * 1024 * 1024;
/** Commits fetched per history request when the client doesn't ask for a count. */
export const DEFAULT_HISTORY_LIMIT = 1000;
/** Hard ceiling regardless of the requested limit — the renderer's safety rail. */
export const MAX_HISTORY_LIMIT = 5000;

// ── Graph layout (lane assignment → pixel positions) ─────────────────────────
/** Horizontal spacing between lanes, in px. */
export const COL_W = 30;
/** Vertical spacing between commit rows, in px. */
export const ROW_H = 60;

// ── Node render ──────────────────────────────────────────────────────────────
/**
 * Declared node box. Giving React Flow explicit dimensions lets it skip the
 * per-node ResizeObserver measurement pass (the main O(n) cost at scale) and keeps
 * fitView / viewport culling accurate. The visual node is allowed to overflow this
 * box (see `.react-flow__node` overflow in history.css) so long ref badges aren't clipped.
 */
export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 28;
/** Edge handles pinned this many px from the node's left edge (the commit dot's center). */
export const HANDLE_DOT_OFFSET = 13;

// ── Viewport ─────────────────────────────────────────────────────────────────
/** Lowest zoom — far enough out to take in a tall history at a glance. */
export const MIN_ZOOM = 0.05;
/** Cap the initial fitView zoom so a short history isn't blown up huge. */
export const FIT_MAX_ZOOM = 1;

// ── Lane colors (one continuous color per branch lane) ───────────────────────
/** Adjacent lanes must differ; lanes beyond the palette wrap around. */
export const LANE_COLORS = [
  "#3b82f6", // blue
  "#22c55e", // green
  "#f59e0b", // amber
  "#a855f7", // purple
  "#ec4899", // pink
  "#14b8a6", // teal
  "#ef4444", // red
  "#eab308", // yellow
];

/** Color for a lane index, wrapping around the palette. */
export function laneColor(lane: number): string {
  return LANE_COLORS[lane % LANE_COLORS.length] ?? "#3b82f6";
}
