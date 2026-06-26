import { describe, expect, it } from "vitest";
import {
  mapPool,
  parseRemotes,
  parseRemoteUrl,
  parseStashCount,
  parseStatusCounts,
  parseWorktreePorcelain,
} from "../../src/server/localScan";

describe("parseRemoteUrl", () => {
  it("returns null for empty or whitespace-only input", () => {
    expect(parseRemoteUrl("")).toBeNull();
    expect(parseRemoteUrl("   ")).toBeNull();
  });

  it("returns null for unparseable junk", () => {
    expect(parseRemoteUrl("not a url")).toBeNull();
    expect(parseRemoteUrl("https://github.com/owner")).toBeNull();
  });

  it("parses scp-style git@host:owner/repo.git, stripping .git", () => {
    expect(parseRemoteUrl("git@github.com:owner/repo.git")).toEqual({
      host: "github.com",
      owner: "owner",
      repo: "repo",
    });
  });

  it("parses scp-style without a .git suffix", () => {
    expect(parseRemoteUrl("git@example.org:acme/widgets")).toEqual({
      host: "example.org",
      owner: "acme",
      repo: "widgets",
    });
  });

  it("parses https://host/owner/repo.git", () => {
    expect(parseRemoteUrl("https://github.com/owner/repo.git")).toEqual({
      host: "github.com",
      owner: "owner",
      repo: "repo",
    });
  });

  it("parses ssh://git@host/owner/repo", () => {
    expect(parseRemoteUrl("ssh://git@forge.example/owner/repo")).toEqual({
      host: "forge.example",
      owner: "owner",
      repo: "repo",
    });
  });

  it("takes the first segment as owner and the last as repo for nested paths", () => {
    // Forgejo/GitLab-style subgroups: owner/sub/repo -> owner is first, repo is last.
    expect(parseRemoteUrl("https://git.example/owner/sub/repo.git")).toEqual({
      host: "git.example",
      owner: "owner",
      repo: "repo",
    });
    expect(parseRemoteUrl("git@git.example:owner/sub/repo.git")).toEqual({
      host: "git.example",
      owner: "owner",
      repo: "repo",
    });
  });
});

describe("parseRemotes", () => {
  it("returns an empty list for empty output", () => {
    expect(parseRemotes("")).toEqual([]);
  });

  it("dedupes the fetch/push pair into one entry per remote, preserving order", () => {
    const raw = [
      "origin\tgit@github.com:owner/repo.git (fetch)",
      "origin\tgit@github.com:owner/repo.git (push)",
      "upstream\thttps://github.com/upstream/repo.git (fetch)",
      "upstream\thttps://github.com/upstream/repo.git (push)",
    ].join("\n");
    expect(parseRemotes(raw)).toEqual([
      { name: "origin", url: "git@github.com:owner/repo.git", host: "github.com", owner: "owner" },
      {
        name: "upstream",
        url: "https://github.com/upstream/repo.git",
        host: "github.com",
        owner: "upstream",
      },
    ]);
  });

  it("keeps origin first when it leads the output", () => {
    const raw = [
      "origin\tgit@github.com:a/one.git (fetch)",
      "origin\tgit@github.com:a/one.git (push)",
      "fork\tgit@github.com:b/two.git (fetch)",
      "fork\tgit@github.com:b/two.git (push)",
    ].join("\n");
    expect(parseRemotes(raw).map((r) => r.name)).toEqual(["origin", "fork"]);
  });

  it("leaves host/owner null when the remote URL is unparseable", () => {
    const raw = "weird\tsome-non-url (fetch)\nweird\tsome-non-url (push)";
    expect(parseRemotes(raw)).toEqual([
      { name: "weird", url: "some-non-url", host: null, owner: null },
    ]);
  });
});

describe("mapPool", () => {
  it("returns an empty array for no items", async () => {
    expect(await mapPool([], 4, async (x) => x)).toEqual([]);
  });

  it("runs every item and preserves input order under a concurrency limit", async () => {
    const items = [10, 20, 30, 40, 50];
    const results = await mapPool(items, 2, async (n) => n * 2);
    expect(results).toEqual([20, 40, 60, 80, 100]);
  });

  it("never exceeds the concurrency limit of in-flight tasks", async () => {
    let active = 0;
    let maxActive = 0;
    const items = [0, 1, 2, 3, 4, 5, 6, 7];
    await mapPool(items, 3, async (n) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return n;
    });
    expect(maxActive).toBeLessThanOrEqual(3);
    expect(maxActive).toBeGreaterThan(1);
  });

  it("propagates a rejection from the mapper", async () => {
    await expect(
      mapPool([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      }),
    ).rejects.toThrow("boom");
  });
});

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

describe("parseStashCount", () => {
  it("returns 0 for empty output", () => {
    expect(parseStashCount("")).toBe(0);
  });

  it("counts NUL-terminated entries, dropping the empty trailing segment", () => {
    // `git stash list -z` terminates each entry with NUL, including the last.
    const raw = "stash@{0}: WIP on main: abc Fix\0stash@{1}: On feat: def WIP\0";
    expect(parseStashCount(raw)).toBe(2);
  });

  it("does not over-count when a stash message contains a newline", () => {
    const raw = "stash@{0}: WIP on main: line one\nline two\0";
    expect(parseStashCount(raw)).toBe(1);
  });
});
