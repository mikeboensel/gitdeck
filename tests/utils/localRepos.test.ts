import { describe, expect, it } from "vitest";
import type { GhRepo, LocalRemote, LocalRepo } from "../../src/types/github";
import {
  arrangeLocalRepos,
  buildLocalFacets,
  DEFAULT_LOCAL_SORT,
  defaultLocalFilters,
  filterLocalRepos,
  type LocalSort,
  localFiltersActiveCount,
  shortRemote,
} from "../../src/utils/localRepos";

describe("shortRemote", () => {
  it("strips scheme, host, and .git from https remotes", () => {
    expect(shortRemote("https://github.com/DenseConnect/widget.git")).toBe("DenseConnect/widget");
    expect(shortRemote("https://gitlab.example.com/team/sub/proj")).toBe("team/sub/proj");
  });

  it("handles scp-style and credentialed remotes", () => {
    expect(shortRemote("git@github.com:acme/widget.git")).toBe("acme/widget");
    expect(shortRemote("https://user@github.com/acme/widget.git")).toBe("acme/widget");
  });

  it("falls back to the raw value when nothing parseable", () => {
    expect(shortRemote("not-a-url")).toBe("not-a-url");
    expect(shortRemote("")).toBe("");
  });
});

function makeRemote(over: Partial<LocalRemote> = {}): LocalRemote {
  return {
    name: "origin",
    url: "https://github.com/acme/widget.git",
    host: "github.com",
    owner: "acme",
    ...over,
  };
}

function makeRepo(over: Partial<LocalRepo> = {}): LocalRepo {
  const path = over.path ?? "/repos/widget";
  return {
    path,
    name: "widget",
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
    sizeBytes: null,
    isWorktree: false,
    gitCommonDir: `${path}/.git`,
    enrichment: null,
    enrichmentStatus: "local-only",
    ...over,
  };
}

function enrichment(over: Partial<GhRepo> = {}): GhRepo {
  return {
    nameWithOwner: "acme/widget",
    name: "widget",
    owner: { login: "acme" },
    description: null,
    stargazerCount: 0,
    forkCount: 0,
    primaryLanguage: null,
    updatedAt: "2026-01-01T00:00:00Z",
    pushedAt: "2026-01-01T00:00:00Z",
    visibility: "public",
    isPrivate: false,
    isArchived: false,
    isFork: false,
    url: "https://github.com/acme/widget",
    ...over,
  };
}

describe("filterLocalRepos", () => {
  const repos = [
    makeRepo({ path: "/a", name: "alpha", nameWithOwner: "acme/alpha", dirty: true }),
    makeRepo({
      path: "/b",
      name: "beta",
      nameWithOwner: "globex/beta",
      remotes: [
        makeRemote({ url: "git@gitlab.com:globex/beta.git", host: "gitlab.com", owner: "globex" }),
      ],
      host: "gitlab.com",
    }),
    makeRepo({ path: "/c", name: "gamma", nameWithOwner: null, remotes: [] }),
  ];

  it("returns every repo on default (empty) filters", () => {
    expect(filterLocalRepos(repos, defaultLocalFilters())).toHaveLength(3);
  });

  it("filters by owner of the authoritative remote", () => {
    const result = filterLocalRepos(repos, {
      ...defaultLocalFilters(),
      owners: new Set(["globex"]),
    });
    expect(result.map((r) => r.name)).toEqual(["beta"]);
  });

  it("filters by any remote host (ANY match)", () => {
    const result = filterLocalRepos(repos, {
      ...defaultLocalFilters(),
      hosts: new Set(["gitlab.com"]),
    });
    expect(result.map((r) => r.name)).toEqual(["beta"]);
  });

  it("filters by any remote URL", () => {
    const result = filterLocalRepos(repos, {
      ...defaultLocalFilters(),
      remotes: new Set(["git@gitlab.com:globex/beta.git"]),
    });
    expect(result.map((r) => r.name)).toEqual(["beta"]);
  });

  it("filters by working-tree status", () => {
    expect(
      filterLocalRepos(repos, { ...defaultLocalFilters(), status: "dirty" }).map((r) => r.name),
    ).toEqual(["alpha"]);
    expect(
      filterLocalRepos(repos, { ...defaultLocalFilters(), status: "clean" }).map((r) => r.name),
    ).toEqual(["beta", "gamma"]);
  });

  it("searches across name, path, nameWithOwner and remote URLs", () => {
    expect(filterLocalRepos(repos, { ...defaultLocalFilters(), search: "alpha" })).toHaveLength(1);
    expect(filterLocalRepos(repos, { ...defaultLocalFilters(), search: "globex" })).toHaveLength(1);
    expect(
      filterLocalRepos(repos, { ...defaultLocalFilters(), search: "gitlab.com" }),
    ).toHaveLength(1);
    expect(filterLocalRepos(repos, { ...defaultLocalFilters(), search: "/c" })).toHaveLength(1);
  });

  it("ANDs dimensions together", () => {
    const result = filterLocalRepos(repos, {
      ...defaultLocalFilters(),
      owners: new Set(["acme"]),
      status: "dirty",
    });
    expect(result.map((r) => r.name)).toEqual(["alpha"]);
  });
});

describe("buildLocalFacets", () => {
  it("counts owners from the authoritative remote only, skipping no-remote repos", () => {
    const facets = buildLocalFacets([
      makeRepo({ path: "/1", nameWithOwner: "acme/one" }),
      makeRepo({ path: "/2", nameWithOwner: "acme/two" }),
      makeRepo({ path: "/3", nameWithOwner: null, remotes: [] }),
    ]);
    expect(facets.owners.get("acme")).toBe(2);
    expect(facets.owners.size).toBe(1);
  });

  it("counts each host once per repo, even with multiple same-host remotes", () => {
    const facets = buildLocalFacets([
      makeRepo({
        path: "/1",
        remotes: [
          makeRemote({ name: "origin", url: "https://github.com/acme/a.git" }),
          makeRemote({ name: "upstream", url: "https://github.com/up/a.git" }),
        ],
      }),
    ]);
    expect(facets.hosts.get("github.com")).toBe(1);
  });

  it("counts each remote URL occurrence", () => {
    const facets = buildLocalFacets([
      makeRepo({
        path: "/1",
        remotes: [
          makeRemote({ url: "https://github.com/acme/a.git" }),
          makeRemote({ name: "fork", url: "https://gitlab.com/x/a.git", host: "gitlab.com" }),
        ],
      }),
    ]);
    expect(facets.remotes.get("https://github.com/acme/a.git")).toBe(1);
    expect(facets.hosts.size).toBe(2);
  });
});

describe("localFiltersActiveCount", () => {
  it("is zero for defaults and sums active dimensions", () => {
    expect(localFiltersActiveCount(defaultLocalFilters())).toBe(0);
    expect(
      localFiltersActiveCount({
        search: "x",
        owners: new Set(["a", "b"]),
        hosts: new Set(["github.com"]),
        remotes: new Set(),
        status: "dirty",
      }),
    ).toBe(2 + 1 + 1 + 1); // owners(2) + hosts(1) + status(1) + search(1)
  });
});

describe("arrangeLocalRepos", () => {
  it("keeps a worktree adjacent to its primary as a single unit", () => {
    const primary = makeRepo({ path: "/repo", name: "repo", gitCommonDir: "/repo/.git" });
    const worktree = makeRepo({
      path: "/repo-wt",
      name: "repo",
      gitCommonDir: "/repo/.git",
      isWorktree: true,
      lastCommit: { sha: "z", date: "2030-01-01T00:00:00Z", message: "future" },
    });
    const units = arrangeLocalRepos([primary, worktree], "committed_desc");
    expect(units).toHaveLength(1);
    expect(units[0]?.primary.path).toBe("/repo");
    expect(units[0]?.worktrees.map((w) => w.path)).toEqual(["/repo-wt"]);
  });

  it("treats an orphaned worktree (primary outside scan) as its own unit", () => {
    const units = arrangeLocalRepos(
      [makeRepo({ path: "/wt", gitCommonDir: "/elsewhere/.git", isWorktree: true })],
      DEFAULT_LOCAL_SORT,
    );
    expect(units).toHaveLength(1);
    expect(units[0]?.primary.path).toBe("/wt");
  });

  const a = makeRepo({
    path: "/a",
    name: "alpha",
    nameWithOwner: "zeta/alpha",
    lastCommit: { sha: "1", date: "2026-01-01T00:00:00Z", message: "" },
    dirty: false,
    enrichment: enrichment({ stargazerCount: 5 }),
    enrichmentStatus: "enriched",
  });
  const b = makeRepo({
    path: "/b",
    name: "beta",
    nameWithOwner: "acme/beta",
    lastCommit: { sha: "2", date: "2026-06-01T00:00:00Z", message: "" },
    dirty: true,
    enrichment: enrichment({ stargazerCount: 99 }),
    enrichmentStatus: "no-remote",
  });

  const order = (sort: LocalSort) => arrangeLocalRepos([a, b], sort).map((u) => u.primary.name);

  it("sorts by most recently committed (default)", () => {
    expect(order("committed_desc")).toEqual(["beta", "alpha"]);
    expect(order("committed_asc")).toEqual(["alpha", "beta"]);
  });

  it("sorts by name and owner", () => {
    expect(order("name_asc")).toEqual(["alpha", "beta"]);
    expect(order("owner_asc")).toEqual(["beta", "alpha"]); // acme before zeta
  });

  it("sorts by stars and dirty-first and link status", () => {
    expect(order("stars_desc")).toEqual(["beta", "alpha"]);
    expect(order("dirty_first")).toEqual(["beta", "alpha"]);
    expect(order("status_asc")).toEqual(["alpha", "beta"]); // enriched before no-remote
  });
});
