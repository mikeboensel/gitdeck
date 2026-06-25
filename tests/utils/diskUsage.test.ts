import { describe, expect, it } from "vitest";
import type { LocalRemote, LocalRepo } from "../../src/types/github";
import { buildDiskUsage, OTHER_KEY, TOP_N } from "../../src/utils/diskUsage";
import { arrangeLocalRepos, assessSafety } from "../../src/utils/localRepos";

function makeRemote(over: Partial<LocalRemote> = {}): LocalRemote {
  return {
    name: "origin",
    url: "https://github.com/acme/r.git",
    host: "github.com",
    owner: "acme",
    ...over,
  };
}

function makeRepo(over: Partial<LocalRepo> = {}): LocalRepo {
  const path = over.path ?? "/repos/widget";
  return {
    path,
    name: over.name ?? "widget",
    remoteUrl: "https://github.com/acme/widget.git",
    remotes: [makeRemote()],
    nameWithOwner: "acme/widget",
    host: "github.com",
    branch: "main",
    ahead: 0,
    behind: 0,
    dirty: false,
    changes: { staged: 0, modified: 0, untracked: 0, conflicted: 0 },
    lastCommit: { sha: "a1", date: "2026-01-01T00:00:00Z", message: "init" },
    sizeBytes: 1000,
    linkedWorktrees: [],
    isWorktree: false,
    gitCommonDir: `${path}/.git`,
    enrichment: null,
    enrichmentStatus: "local-only",
    ...over,
  };
}

/** Assert a value is defined (narrows away `| undefined` from indexed access). */
function def<T>(v: T | undefined): T {
  if (v === undefined) throw new Error("expected a defined value");
  return v;
}

/** Build a single-repo unit for safety assertions. */
function unitOf(repo: LocalRepo) {
  return def(arrangeLocalRepos([repo], "size_desc")[0]);
}

describe("assessSafety", () => {
  it("marks a clean, pushed, remote-backed standalone repo as safe", () => {
    const res = assessSafety(unitOf(makeRepo()));
    expect(res.safe).toBe(true);
    expect(res.blockers).toEqual([]);
  });

  it("flags uncommitted changes", () => {
    const res = assessSafety(unitOf(makeRepo({ dirty: true })));
    expect(res.safe).toBe(false);
    expect(res.blockers).toContain("dirty");
  });

  it("flags unpushed commits", () => {
    const res = assessSafety(unitOf(makeRepo({ ahead: 3 })));
    expect(res.blockers).toContain("unpushed");
  });

  it("flags a repo with no remote", () => {
    const res = assessSafety(unitOf(makeRepo({ remotes: [], remoteUrl: null })));
    expect(res.blockers).toContain("no-remote");
  });

  it("flags live (non-prunable) linked worktrees authoritatively", () => {
    const primary = makeRepo({
      linkedWorktrees: [
        { path: "/wt/a", branch: "a", sizeBytes: 100, prunable: false },
        { path: "/wt/b", branch: "b", sizeBytes: null, prunable: true },
      ],
    });
    const res = assessSafety(def(arrangeLocalRepos([primary], "size_desc")[0]));
    expect(res.safe).toBe(false);
    expect(res.blockers).toContain("linked-worktrees");
  });

  it("does not flag a primary whose only worktrees are prunable", () => {
    const primary = makeRepo({
      linkedWorktrees: [{ path: "/wt/dead", branch: "x", sizeBytes: null, prunable: true }],
    });
    const res = assessSafety(def(arrangeLocalRepos([primary], "size_desc")[0]));
    expect(res.blockers).not.toContain("linked-worktrees");
    expect(res.safe).toBe(true);
  });

  it("flags an orphan worktree whose primary is outside the scan roots", () => {
    const orphan = makeRepo({
      path: "/repos/wt",
      gitCommonDir: "/elsewhere/.git",
      isWorktree: true,
    });
    const res = assessSafety(unitOf(orphan));
    expect(res.blockers).toContain("is-worktree");
  });

  it("accumulates multiple blockers", () => {
    const res = assessSafety(
      unitOf(makeRepo({ dirty: true, ahead: 2, remotes: [], remoteUrl: null })),
    );
    expect(res.blockers).toEqual(expect.arrayContaining(["dirty", "unpushed", "no-remote"]));
    expect(res.safe).toBe(false);
  });
});

describe("buildDiskUsage", () => {
  function repos(n: number, sizeFor: (i: number) => number | null): LocalRepo[] {
    return Array.from({ length: n }, (_, i) =>
      makeRepo({
        path: `/repos/r${i}`,
        name: `r${i}`,
        gitCommonDir: `/repos/r${i}/.git`,
        sizeBytes: sizeFor(i),
      }),
    );
  }

  it("sums measured sizes and excludes unmeasured", () => {
    const list = [
      makeRepo({ path: "/a", name: "a", gitCommonDir: "/a/.git", sizeBytes: 100 }),
      makeRepo({ path: "/b", name: "b", gitCommonDir: "/b/.git", sizeBytes: 200 }),
      makeRepo({ path: "/c", name: "c", gitCommonDir: "/c/.git", sizeBytes: null }),
    ];
    const model = buildDiskUsage(list);
    expect(model.totalBytes).toBe(300);
    expect(model.measuredCount).toBe(2);
    expect(model.unmeasuredCount).toBe(1);
    expect(model.otherCount).toBe(0);
  });

  it("orders wedges by descending size", () => {
    const model = buildDiskUsage(repos(3, (i) => (i + 1) * 1000));
    expect(model.wedges.map((w) => w.bytes)).toEqual([3000, 2000, 1000]);
  });

  it("collapses beyond TOP_N into a single Other wedge", () => {
    const n = TOP_N + 5;
    const model = buildDiskUsage(repos(n, (i) => n - i)); // descending distinct sizes
    expect(model.wedges).toHaveLength(TOP_N + 1);
    const other = def(model.wedges.at(-1));
    expect(other.key).toBe(OTHER_KEY);
    expect(other.unit).toBeNull();
    expect(other.safety).toBeNull();
    expect(model.otherCount).toBe(5);
    // Total equals the sum of every measured repo (head + folded tail).
    const expectedTotal = Array.from({ length: n }, (_, i) => n - i).reduce((s, v) => s + v, 0);
    expect(model.totalBytes).toBe(expectedTotal);
    expect(other.bytes).toBe(
      expectedTotal - model.wedges.slice(0, TOP_N).reduce((s, w) => s + w.bytes, 0),
    );
  });

  it("adds authoritative worktree sizes to the primary, excluding prunable ones", () => {
    const primary = makeRepo({
      path: "/m",
      name: "m",
      gitCommonDir: "/m/.git",
      sizeBytes: 500,
      linkedWorktrees: [
        { path: "/wt/a", branch: "a", sizeBytes: 250, prunable: false },
        { path: "/wt/b", branch: "b", sizeBytes: null, prunable: true },
      ],
    });
    const model = buildDiskUsage([primary]);
    expect(model.wedges).toHaveLength(1);
    expect(def(model.wedges[0]).bytes).toBe(750); // 500 primary + 250 worktree, prunable skipped
    expect(model.measuredCount).toBe(1);
  });

  it("returns an empty model when nothing is measurable", () => {
    const model = buildDiskUsage(repos(3, () => null));
    expect(model.measuredCount).toBe(0);
    expect(model.wedges).toEqual([]);
    expect(model.unmeasuredCount).toBe(3);
  });
});
