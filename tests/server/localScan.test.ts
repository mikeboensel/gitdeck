import { describe, expect, it } from "vitest";
import { parseStatusCounts } from "../../src/server/localScan";

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
