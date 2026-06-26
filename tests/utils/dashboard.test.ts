import { describe, expect, it } from "vitest";
import type { GhIssue, GhPullRequest, GhRepo } from "../../src/types/github";
import {
  buildIssueFacets,
  buildPullRequestFacets,
  buildRepoFacets,
  filterIssues,
  filterPullRequests,
  filterRepos,
  matchesIssuePreset,
  matchesPullRequestPreset,
  reviewDecisionLabel,
  sortIssues,
  sortPullRequests,
  sortRepos,
} from "../../src/utils/dashboard";

const issues: GhIssue[] = [
  {
    repository: { name: "app", nameWithOwner: "acme/app" },
    title: "Fix dark mode contrast",
    url: "https://github.com/acme/app/issues/1",
    number: 1,
    createdAt: "2026-04-20T10:00:00Z",
    updatedAt: "2026-04-22T10:00:00Z",
    author: { login: "alice" },
    labels: [{ name: "bug", color: "ff0000" }],
    commentsCount: 4,
    assignees: [{ login: "bob" }],
  },
  {
    repository: { name: "cli", nameWithOwner: "acme/cli" },
    title: "Add export command",
    url: "https://github.com/acme/cli/issues/2",
    number: 2,
    createdAt: "2026-04-18T10:00:00Z",
    updatedAt: "2026-04-19T10:00:00Z",
    author: { login: "bob" },
    labels: [{ name: "feature", color: "00ff00" }],
    commentsCount: 1,
    assignees: [],
  },
];

const repos: GhRepo[] = [
  {
    nameWithOwner: "acme/app",
    name: "app",
    owner: { login: "acme" },
    description: "Dashboard app",
    stargazerCount: 20,
    forkCount: 3,
    primaryLanguage: { name: "TypeScript" },
    updatedAt: "2026-04-22T10:00:00Z",
    pushedAt: "2026-04-22T10:00:00Z",
    visibility: "PUBLIC",
    isPrivate: false,
    isArchived: false,
    isFork: false,
    url: "https://github.com/acme/app",
  },
  {
    nameWithOwner: "acme/cli",
    name: "cli",
    owner: { login: "acme" },
    description: "CLI",
    stargazerCount: 5,
    forkCount: 8,
    primaryLanguage: { name: "Go" },
    updatedAt: "2026-04-19T10:00:00Z",
    pushedAt: "2026-04-19T10:00:00Z",
    visibility: "PRIVATE",
    isPrivate: true,
    isArchived: false,
    isFork: false,
    url: "https://github.com/acme/cli",
  },
];

const pullRequests: GhPullRequest[] = [
  {
    repository: { name: "app", nameWithOwner: "acme/app" },
    title: "Add dark mode tokens",
    url: "https://github.com/acme/app/pull/10",
    number: 10,
    createdAt: "2026-04-21T10:00:00Z",
    updatedAt: "2026-04-22T10:00:00Z",
    author: { login: "alice" },
    labels: [{ name: "ui", color: "0000ff" }],
    commentsCount: 2,
    assignees: [{ login: "bob" }],
    isDraft: false,
    reviewDecision: "APPROVED",
    reviewsCount: 2,
    additions: 120,
    deletions: 30,
    changedFiles: 6,
    baseRefName: "main",
    headRefName: "feature/dark-mode",
  },
  {
    repository: { name: "cli", nameWithOwner: "acme/cli" },
    title: "WIP: experimental flag",
    url: "https://github.com/acme/cli/pull/4",
    number: 4,
    createdAt: "2026-04-15T10:00:00Z",
    updatedAt: "2026-04-15T10:00:00Z",
    author: { login: "bob" },
    labels: [],
    commentsCount: 0,
    assignees: [],
    isDraft: true,
    reviewDecision: null,
    reviewsCount: 0,
    additions: 5,
    deletions: 1,
    changedFiles: 1,
    baseRefName: "main",
    headRefName: "wip/flag",
  },
  {
    repository: { name: "app", nameWithOwner: "acme/app" },
    title: "Refactor router",
    url: "https://github.com/acme/app/pull/11",
    number: 11,
    createdAt: "2026-04-20T10:00:00Z",
    updatedAt: "2026-04-20T10:00:00Z",
    author: { login: "alice" },
    labels: [],
    commentsCount: 1,
    assignees: [],
    isDraft: false,
    reviewDecision: null,
    reviewsCount: 0,
    additions: 80,
    deletions: 60,
    changedFiles: 10,
    baseRefName: "main",
    headRefName: "refactor/router",
  },
];

describe("dashboard utilities", () => {
  it("builds issue facets from shared issue types", () => {
    const facets = buildIssueFacets(issues);

    expect(facets.orgs.get("acme")).toBe(2);
    expect(facets.labels.get("bug")).toEqual({ count: 1, color: "ff0000" });
    expect(facets.assignees.get("bob")).toBe(1);
  });

  it("filters issues by search and selected values", () => {
    const result = filterIssues(
      issues,
      {
        search: "contrast",
        orgs: new Set(["acme"]),
        repos: new Set(["acme/app"]),
        labels: new Set(["bug"]),
        authors: new Set(),
        assignees: new Set(["bob"]),
        dates: { cf: "", ct: "", uf: "", ut: "" },
        preset: "",
      },
      "alice",
    );

    expect(result.map((issue) => issue.number)).toEqual([1]);
  });

  it("filters repositories by visibility and language", () => {
    const result = filterRepos(repos, issues, {
      search: "",
      orgs: new Set(["acme"]),
      languages: new Set(["Go"]),
      collaborators: new Set(),
      visibility: "private",
      includeForks: true,
      includeArchived: false,
    });

    expect(result.map((repo) => repo.nameWithOwner)).toEqual(["acme/cli"]);
  });

  it("sorts issues and repositories", () => {
    expect(sortIssues(issues, "comments_desc").map((issue) => issue.number)).toEqual([1, 2]);
    expect(sortRepos(repos, issues, "forks_desc").map((repo) => repo.nameWithOwner)).toEqual([
      "acme/cli",
      "acme/app",
    ]);
  });

  it("builds PR facets from shared PR types", () => {
    const facets = buildPullRequestFacets(pullRequests);
    expect(facets.repos.get("acme/app")).toBe(2);
    expect(facets.authors.get("alice")).toBe(2);
    expect(facets.labels.get("ui")).toEqual({ count: 1, color: "0000ff" });
  });

  it("matches PR presets for review state and draft", () => {
    expect(matchesPullRequestPreset(pullRequests[0]!, "approved", "alice")).toBe(true);
    expect(matchesPullRequestPreset(pullRequests[1]!, "draft", "alice")).toBe(true);
    expect(matchesPullRequestPreset(pullRequests[1]!, "ready", "alice")).toBe(false);
    expect(matchesPullRequestPreset(pullRequests[2]!, "awaiting-review", "alice")).toBe(true);
    expect(matchesPullRequestPreset(pullRequests[0]!, "authored-me", "alice")).toBe(true);
  });

  it("filters PRs by repo, author and search", () => {
    const result = filterPullRequests(
      pullRequests,
      {
        search: "router",
        orgs: new Set(["acme"]),
        repos: new Set(["acme/app"]),
        labels: new Set(),
        authors: new Set(["alice"]),
        assignees: new Set(),
        dates: { cf: "", ct: "", uf: "", ut: "" },
        preset: "",
      },
      "alice",
    );
    expect(result.map((pr) => pr.number)).toEqual([11]);
  });

  it("sorts PRs by review-pending and diff size", () => {
    const byReview = sortPullRequests(pullRequests, "review_pending").map((pr) => pr.number);
    expect(byReview[0]).toBe(11);
    const bySize = sortPullRequests(pullRequests, "size_desc").map((pr) => pr.number);
    expect(bySize[0]).toBe(10);
    expect(bySize[bySize.length - 1]).toBe(4);
  });
});

// Fixed reference instant; presets take an explicit `now`, so no fake timers needed.
const NOW = new Date("2026-06-26T12:00:00Z").getTime();

const baseIssue: GhIssue = {
  repository: { name: "app", nameWithOwner: "acme/app" },
  title: "issue",
  url: "https://github.com/acme/app/issues/1",
  number: 1,
  createdAt: "2026-06-26T12:00:00Z",
  updatedAt: "2026-06-26T12:00:00Z",
  author: { login: "alice" },
  labels: [],
  commentsCount: 0,
  assignees: [],
};
const makeIssue = (overrides: Partial<GhIssue>): GhIssue => ({ ...baseIssue, ...overrides });

describe("matchesIssuePreset", () => {
  it("no-assignee matches only when assignees are empty", () => {
    expect(matchesIssuePreset(makeIssue({ assignees: [] }), "no-assignee", "alice", NOW)).toBe(
      true,
    );
    expect(
      matchesIssuePreset(makeIssue({ assignees: [{ login: "bob" }] }), "no-assignee", "alice", NOW),
    ).toBe(false);
  });

  it("week matches createdAt strictly within the last 7 days (exclusive boundary)", () => {
    // 4 days ago — inside the window.
    expect(
      matchesIssuePreset(makeIssue({ createdAt: "2026-06-22T12:00:00Z" }), "week", "alice", NOW),
    ).toBe(true);
    // 16 days ago — outside.
    expect(
      matchesIssuePreset(makeIssue({ createdAt: "2026-06-10T12:00:00Z" }), "week", "alice", NOW),
    ).toBe(false);
    // Exactly 7 days ago — the check is `< 7d`, so the boundary itself is excluded.
    expect(
      matchesIssuePreset(makeIssue({ createdAt: "2026-06-19T12:00:00Z" }), "week", "alice", NOW),
    ).toBe(false);
    // One second inside 7 days — included.
    expect(
      matchesIssuePreset(makeIssue({ createdAt: "2026-06-19T12:00:01Z" }), "week", "alice", NOW),
    ).toBe(true);
  });

  it("today matches when updatedAt falls on the same calendar day as now", () => {
    expect(
      matchesIssuePreset(makeIssue({ updatedAt: "2026-06-26T12:00:00Z" }), "today", "alice", NOW),
    ).toBe(true);
    expect(
      matchesIssuePreset(makeIssue({ updatedAt: "2026-06-20T12:00:00Z" }), "today", "alice", NOW),
    ).toBe(false);
  });

  it("stale matches updatedAt older than 30 days (exclusive boundary)", () => {
    // 56 days ago — stale.
    expect(
      matchesIssuePreset(makeIssue({ updatedAt: "2026-05-01T12:00:00Z" }), "stale", "alice", NOW),
    ).toBe(true);
    // 1 day ago — fresh.
    expect(
      matchesIssuePreset(makeIssue({ updatedAt: "2026-06-25T12:00:00Z" }), "stale", "alice", NOW),
    ).toBe(false);
    // Exactly 30 days ago — `> 30d` excludes the boundary.
    expect(
      matchesIssuePreset(makeIssue({ updatedAt: "2026-05-27T12:00:00Z" }), "stale", "alice", NOW),
    ).toBe(false);
    // One second past 30 days — stale.
    expect(
      matchesIssuePreset(makeIssue({ updatedAt: "2026-05-27T11:59:59Z" }), "stale", "alice", NOW),
    ).toBe(true);
  });

  it("assigned-me matches when the user is among the assignees", () => {
    const issue = makeIssue({ assignees: [{ login: "alice" }, { login: "bob" }] });
    expect(matchesIssuePreset(issue, "assigned-me", "alice", NOW)).toBe(true);
    expect(matchesIssuePreset(issue, "assigned-me", "carol", NOW)).toBe(false);
    // No logged-in user → never matches.
    expect(matchesIssuePreset(issue, "assigned-me", "", NOW)).toBe(false);
  });

  it("authored-me matches when the author is the user", () => {
    expect(
      matchesIssuePreset(makeIssue({ author: { login: "alice" } }), "authored-me", "alice", NOW),
    ).toBe(true);
    expect(
      matchesIssuePreset(makeIssue({ author: { login: "bob" } }), "authored-me", "alice", NOW),
    ).toBe(false);
  });
});

const basePr: GhPullRequest = {
  repository: { name: "app", nameWithOwner: "acme/app" },
  title: "pr",
  url: "https://github.com/acme/app/pull/1",
  number: 1,
  createdAt: "2026-06-26T12:00:00Z",
  updatedAt: "2026-06-26T12:00:00Z",
  author: { login: "alice" },
  labels: [],
  commentsCount: 0,
  assignees: [],
  isDraft: false,
  reviewDecision: null,
  reviewsCount: 0,
  additions: 0,
  deletions: 0,
  changedFiles: 0,
  baseRefName: "main",
  headRefName: "feature",
};
const makePr = (overrides: Partial<GhPullRequest>): GhPullRequest => ({ ...basePr, ...overrides });

describe("matchesPullRequestPreset (uncovered branches)", () => {
  it("changes-requested matches only the CHANGES_REQUESTED review decision", () => {
    expect(
      matchesPullRequestPreset(
        makePr({ reviewDecision: "CHANGES_REQUESTED" }),
        "changes-requested",
        "alice",
        NOW,
      ),
    ).toBe(true);
    expect(
      matchesPullRequestPreset(
        makePr({ reviewDecision: "APPROVED" }),
        "changes-requested",
        "alice",
        NOW,
      ),
    ).toBe(false);
    expect(
      matchesPullRequestPreset(makePr({ reviewDecision: null }), "changes-requested", "alice", NOW),
    ).toBe(false);
  });

  it("stale uses a 14-day threshold (distinct from issues' 30; exclusive boundary)", () => {
    // 20 days ago — stale under the PR's 14-day rule (would NOT be stale under issues' 30-day rule).
    expect(
      matchesPullRequestPreset(
        makePr({ updatedAt: "2026-06-06T12:00:00Z" }),
        "stale",
        "alice",
        NOW,
      ),
    ).toBe(true);
    // 10 days ago — fresh.
    expect(
      matchesPullRequestPreset(
        makePr({ updatedAt: "2026-06-16T12:00:00Z" }),
        "stale",
        "alice",
        NOW,
      ),
    ).toBe(false);
    // Exactly 14 days ago — `> 14d` excludes the boundary.
    expect(
      matchesPullRequestPreset(
        makePr({ updatedAt: "2026-06-12T12:00:00Z" }),
        "stale",
        "alice",
        NOW,
      ),
    ).toBe(false);
    // One second past 14 days — stale.
    expect(
      matchesPullRequestPreset(
        makePr({ updatedAt: "2026-06-12T11:59:59Z" }),
        "stale",
        "alice",
        NOW,
      ),
    ).toBe(true);
  });

  it("today matches when updatedAt is on the current calendar day", () => {
    expect(
      matchesPullRequestPreset(
        makePr({ updatedAt: "2026-06-26T12:00:00Z" }),
        "today",
        "alice",
        NOW,
      ),
    ).toBe(true);
    expect(
      matchesPullRequestPreset(
        makePr({ updatedAt: "2026-06-01T12:00:00Z" }),
        "today",
        "alice",
        NOW,
      ),
    ).toBe(false);
  });

  it("week matches createdAt within the last 7 days", () => {
    expect(
      matchesPullRequestPreset(makePr({ createdAt: "2026-06-23T12:00:00Z" }), "week", "alice", NOW),
    ).toBe(true);
    expect(
      matchesPullRequestPreset(makePr({ createdAt: "2026-06-10T12:00:00Z" }), "week", "alice", NOW),
    ).toBe(false);
  });

  it("assigned-me matches when the user is among the PR assignees", () => {
    const pr = makePr({ assignees: [{ login: "alice" }] });
    expect(matchesPullRequestPreset(pr, "assigned-me", "alice", NOW)).toBe(true);
    expect(matchesPullRequestPreset(pr, "assigned-me", "bob", NOW)).toBe(false);
  });
});

describe("reviewDecisionLabel", () => {
  it("maps each review decision to its label", () => {
    expect(reviewDecisionLabel("APPROVED")).toBe("Approved");
    expect(reviewDecisionLabel("CHANGES_REQUESTED")).toBe("Changes requested");
    expect(reviewDecisionLabel("REVIEW_REQUIRED")).toBe("Awaiting review");
    expect(reviewDecisionLabel(null)).toBe("Awaiting review");
  });
});

const emptyDates = { cf: "", ct: "", uf: "", ut: "" };

describe("date-range filtering (withinDateRange)", () => {
  it("treats empty date bounds as open-ended", () => {
    const result = filterIssues(
      [makeIssue({ number: 1, createdAt: "2020-01-01T00:00:00Z" }), makeIssue({ number: 2 })],
      {
        search: "",
        orgs: new Set(),
        repos: new Set(),
        labels: new Set(),
        authors: new Set(),
        assignees: new Set(),
        dates: emptyDates,
        preset: "",
      },
      "alice",
    );
    expect(result.map((i) => i.number)).toEqual([1, 2]);
  });

  it("includes an issue created exactly on the inclusive `to` date", () => {
    const onTo = makeIssue({ number: 1, createdAt: "2026-04-22T12:00:00Z" });
    const nextDay = makeIssue({ number: 2, createdAt: "2026-04-23T12:00:00Z" });
    const result = filterIssues(
      [onTo, nextDay],
      {
        search: "",
        orgs: new Set(),
        repos: new Set(),
        labels: new Set(),
        authors: new Set(),
        assignees: new Set(),
        // `to` is widened to T23:59:59, so an item on that calendar day must be kept.
        dates: { cf: "2026-04-22", ct: "2026-04-22", uf: "", ut: "" },
        preset: "",
      },
      "alice",
    );
    expect(result.map((i) => i.number)).toEqual([1]);
  });

  it("includes a PR created exactly on the inclusive `to` date", () => {
    const onTo = makePr({ number: 1, createdAt: "2026-04-22T12:00:00Z" });
    const nextDay = makePr({ number: 2, createdAt: "2026-04-23T12:00:00Z" });
    const result = filterPullRequests(
      [onTo, nextDay],
      {
        search: "",
        orgs: new Set(),
        repos: new Set(),
        labels: new Set(),
        authors: new Set(),
        assignees: new Set(),
        dates: { cf: "2026-04-22", ct: "2026-04-22", uf: "", ut: "" },
        preset: "",
      },
      "alice",
    );
    expect(result.map((p) => p.number)).toEqual([1]);
  });
});

const baseRepo: GhRepo = {
  nameWithOwner: "acme/app",
  name: "app",
  owner: { login: "acme" },
  description: null,
  stargazerCount: 0,
  forkCount: 0,
  primaryLanguage: { name: "TypeScript" },
  updatedAt: "2026-04-22T10:00:00Z",
  pushedAt: "2026-04-22T10:00:00Z",
  visibility: "PUBLIC",
  isPrivate: false,
  isArchived: false,
  isFork: false,
  url: "https://github.com/acme/app",
};
const makeRepo = (overrides: Partial<GhRepo>): GhRepo => ({ ...baseRepo, ...overrides });

describe("buildRepoFacets", () => {
  it("buckets repos with no primary language under the em-dash placeholder", () => {
    const facets = buildRepoFacets([
      makeRepo({ nameWithOwner: "acme/x", primaryLanguage: null }),
      makeRepo({ nameWithOwner: "acme/y", primaryLanguage: { name: "Go" } }),
    ]);
    expect(facets.languages.get("—")).toBe(1);
    expect(facets.languages.get("Go")).toBe(1);
  });

  it("counts each collaborator once per repo shared with the user", () => {
    const facets = buildRepoFacets(
      [makeRepo({ nameWithOwner: "acme/x" }), makeRepo({ nameWithOwner: "acme/y" })],
      new Map([
        ["acme/x", ["dave", "erin"]],
        ["acme/y", ["dave"]],
      ]),
    );
    expect(facets.collaborators.get("dave")).toBe(2);
    expect(facets.collaborators.get("erin")).toBe(1);
  });
});
