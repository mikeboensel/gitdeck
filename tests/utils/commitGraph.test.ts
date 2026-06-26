import { describe, expect, it } from "vitest";
import type { LocalCommitNode } from "../../src/types/github";
import { COL_W, layoutCommits, ROW_H } from "../../src/utils/commitGraph";

/** Minimal commit-node factory; only sha + parents matter for layout. */
function node(sha: string, parents: string[] = []): LocalCommitNode {
  return { sha, parents, author: "a", date: "", refs: [], subject: sha };
}

/** Set of `source>target` strings for order-independent edge assertions. */
function edgeSet(commits: LocalCommitNode[]): Set<string> {
  return new Set(layoutCommits(commits).edges.map((e) => `${e.source}>${e.target}`));
}

describe("layoutCommits", () => {
  it("returns an empty graph for no commits", () => {
    expect(layoutCommits([])).toEqual({ nodes: [], edges: [], laneCount: 1 });
  });

  it("keeps a linear history in a single lane with chained edges", () => {
    const commits = [node("a", ["b"]), node("b", ["c"]), node("c")];
    const graph = layoutCommits(commits);

    expect(graph.laneCount).toBe(1);
    expect(graph.nodes.map((n) => n.lane)).toEqual([0, 0, 0]);
    // Row positions track input order; lane 0 → x 0.
    expect(graph.nodes.map((n) => n.position)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: ROW_H },
      { x: 0, y: 2 * ROW_H },
    ]);
    expect(edgeSet(commits)).toEqual(new Set(["a>b", "b>c"]));
  });

  it("places a merge's second parent in a new lane and rejoins the trunk", () => {
    // m ─┬─ a ─┐
    //    └─ b ─┴─ base
    const commits = [node("m", ["a", "b"]), node("a", ["base"]), node("b", ["base"]), node("base")];
    const graph = layoutCommits(commits);

    expect(graph.laneCount).toBe(2);
    const lane = Object.fromEntries(graph.nodes.map((n) => [n.id, n.lane]));
    expect(lane).toEqual({ m: 0, a: 0, b: 1, base: 0 });
    // b sits in lane 1 → x offset by one column.
    const b = graph.nodes.find((n) => n.id === "b");
    expect(b?.position.x).toBe(COL_W);
    expect(edgeSet(commits)).toEqual(new Set(["m>a", "m>b", "a>base", "b>base"]));
  });

  it("ignores parents outside the loaded window", () => {
    // `b` is not in the list (history truncated) — no dangling edge to it.
    const commits = [node("a", ["b"])];
    const graph = layoutCommits(commits);
    expect(graph.edges).toEqual([]);
    expect(graph.nodes).toHaveLength(1);
  });

  it("handles multiple independent roots without inventing edges", () => {
    const commits = [node("x"), node("y")];
    const graph = layoutCommits(commits);
    expect(graph.edges).toEqual([]);
    // Both roots are unrelated; lane reuse keeps them in column 0.
    expect(graph.nodes.map((n) => n.lane)).toEqual([0, 0]);
  });

  it("gives two children of a shared parent distinct lanes", () => {
    const commits = [node("c1", ["p"]), node("c2", ["p"]), node("p")];
    const graph = layoutCommits(commits);
    const lane = Object.fromEntries(graph.nodes.map((n) => [n.id, n.lane]));
    expect(lane.c1).toBe(0);
    expect(lane.c2).toBe(1);
    expect(lane.p).toBe(0);
    expect(edgeSet(commits)).toEqual(new Set(["c1>p", "c2>p"]));
  });
});
