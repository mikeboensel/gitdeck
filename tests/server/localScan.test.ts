import { describe, expect, it } from "vitest";
import { parseStatusCounts, parseWorktreePorcelain } from "../../src/server/localScan";

describe("parseWorktreePorcelain", () => {
  const raw = [
    "worktree /repos/main",
    "HEAD 1cb2172",
    "branch refs/heads/main",
    "",
    "worktree /elsewhere/oslo",
    "HEAD a8d8fb6",
    "branch refs/heads/mikeboensel/oslo",
    "prunable gitdir file points to non-existent location",
    "",
    "worktree /elsewhere/bordeaux",
    "HEAD c809df2",
    "branch refs/heads/mikeboensel/agent-loop",
    "",
  ].join("\n");

  it("parses every entry including the primary, with branch and prunable flags", () => {
    const entries = parseWorktreePorcelain(raw);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toEqual({ path: "/repos/main", branch: "main", prunable: false });
    expect(entries[1]).toEqual({
      path: "/elsewhere/oslo",
      branch: "mikeboensel/oslo",
      prunable: true,
    });
    expect(entries[2]?.prunable).toBe(false);
  });

  it("leaves branch null for a detached worktree", () => {
    const detached = ["worktree /repos/d", "HEAD abc123", "detached", ""].join("\n");
    expect(parseWorktreePorcelain(detached)[0]).toEqual({
      path: "/repos/d",
      branch: null,
      prunable: false,
    });
  });
});

describe("parseStatusCounts", () => {
  it("returns all-zero counts for empty output", () => {
    expect(parseStatusCounts("")).toEqual({
      staged: 0,
      modified: 0,
      untracked: 0,
      conflicted: 0,
    });
  });

  it("counts staged (index) changes from the X column", () => {
    // `A `, `M `, `D `, `R ` — index change, clean worktree.
    const raw = "A  added.ts\nM  edited.ts\nD  deleted.ts";
    expect(parseStatusCounts(raw)).toMatchObject({ staged: 3, modified: 0 });
  });

  it("counts unstaged worktree changes from the Y column", () => {
    const raw = " M edited.ts\n D deleted.ts";
    expect(parseStatusCounts(raw)).toMatchObject({ staged: 0, modified: 2 });
  });

  it("counts a file that is both staged and modified once in each bucket", () => {
    expect(parseStatusCounts("MM both.ts")).toMatchObject({ staged: 1, modified: 1 });
  });

  it("counts untracked files", () => {
    expect(parseStatusCounts("?? new.ts\n?? other.ts")).toMatchObject({ untracked: 2 });
  });

  it("counts unmerged paths as conflicts, not staged/modified", () => {
    // UU (both modified), AA (both added), DD (both deleted), and U-in-either-column.
    const raw = "UU conflict.ts\nAA addadd.ts\nDD deldel.ts\nDU mixed.ts\nUA mixed2.ts";
    expect(parseStatusCounts(raw)).toEqual({
      staged: 0,
      modified: 0,
      untracked: 0,
      conflicted: 5,
    });
  });

  it("tallies a mixed working tree across every category", () => {
    const raw = ["M  staged.ts", " M dirty.ts", "?? untracked.ts", "UU conflict.ts"].join("\n");
    expect(parseStatusCounts(raw)).toEqual({
      staged: 1,
      modified: 1,
      untracked: 1,
      conflicted: 1,
    });
  });

  it("ignores blank trailing lines", () => {
    expect(parseStatusCounts("M  a.ts\n\n")).toMatchObject({ staged: 1 });
  });
});
