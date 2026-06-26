/**
 * Pure lane-assignment for the commit-history graph. Turns the flat,
 * newest-first commit list (`git log --all --date-order`) into positioned nodes +
 * edges that React Flow can render. The git-specific layout lives here so it's
 * unit-testable in isolation; the modal only feeds the output to `<ReactFlow>`.
 *
 * Lanes (columns) are assigned greedily in row order: a lane "expects" a SHA, and
 * when that commit appears it claims the lane and passes the expectation to its
 * first parent (the trunk continues straight down). Additional merge parents open
 * new lanes. A SHA is expected by at most one lane, so the columns stay stable.
 */
import type { LocalCommitNode } from "../types/github";
import { COL_W, ROW_H } from "./commitGraphConfig";

// Re-exported so existing layout consumers (the modal, tests) keep importing the
// lane/row spacing from the layout module; the values themselves live in the config.
export { COL_W, ROW_H };

export interface GraphNode {
  /** Commit SHA (also the React Flow node id). */
  id: string;
  /** Pixel position derived from (lane, row). */
  position: { x: number; y: number };
  /** Assigned lane (column) index. */
  lane: number;
  /** Row index (0 = newest, top). */
  row: number;
  data: LocalCommitNode;
}

export interface GraphEdge {
  /** `${childSha}-${parentSha}`. */
  id: string;
  /** Child (newer) commit SHA. */
  source: string;
  /** Parent (older) commit SHA. */
  target: string;
}

export interface CommitGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Number of lanes used — the graph's column span. */
  laneCount: number;
}

export function layoutCommits(commits: LocalCommitNode[]): CommitGraph {
  const known = new Set(commits.map((commit) => commit.sha));
  // lanes[i] = the SHA lane i currently expects to render next, or null when free.
  const lanes: (string | null)[] = [];
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const claimFreeLane = (): number => {
    const free = lanes.indexOf(null);
    if (free !== -1) return free;
    lanes.push(null);
    return lanes.length - 1;
  };

  commits.forEach((commit, row) => {
    let lane = lanes.indexOf(commit.sha);
    if (lane === -1) lane = claimFreeLane();

    nodes.push({
      id: commit.sha,
      position: { x: lane * COL_W, y: row * ROW_H },
      lane,
      row,
      data: commit,
    });

    // Edge to every parent that's within the loaded window.
    for (const parent of commit.parents) {
      if (known.has(parent)) {
        edges.push({ id: `${commit.sha}-${parent}`, source: commit.sha, target: parent });
      }
    }

    // The trunk continues straight down to the first parent in this same lane —
    // unless another lane already expects it (then free this lane to avoid a dup).
    const [first, ...rest] = commit.parents;
    if (first && known.has(first) && lanes.indexOf(first) === -1) {
      lanes[lane] = first;
    } else {
      lanes[lane] = null;
    }

    // Each additional merge parent opens its own lane (unless already expected).
    for (const parent of rest) {
      if (known.has(parent) && lanes.indexOf(parent) === -1) {
        lanes[claimFreeLane()] = parent;
      }
    }
  });

  const laneCount = nodes.reduce((max, node) => Math.max(max, node.lane + 1), 1);
  return { nodes, edges, laneCount };
}
