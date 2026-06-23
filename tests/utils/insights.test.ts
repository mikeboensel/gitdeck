import { describe, expect, it } from "vitest";
import type { GhIssue, GhRepo } from "../../src/types/github";
import { buildRepoInsight } from "../../src/utils/insights";

const repo: GhRepo = {
  nameWithOwner: "acme/sdk",
  name: "sdk",
  owner: { login: "acme" },
  description: "SDK",
  stargazerCount: 120,
  forkCount: 14,
  primaryLanguage: { name: "TypeScript" },
  updatedAt: "2026-04-20T10:00:00Z",
  pushedAt: "2026-04-10T10:00:00Z",
  visibility: "PUBLIC",
  isPrivate: false,
  isArchived: false,
  isFork: false,
  url: "https://github.com/acme/sdk",
  history: [
    { date: "2026-04-01", stars: 110, forks: 12 },
    { date: "2026-04-23", stars: 120, forks: 14 },
  ],
};

const issues: GhIssue[] = [
  {
    repository: { name: "sdk", nameWithOwner: "acme/sdk" },
    title: "A",
    url: "https://github.com/acme/sdk/issues/1",
    number: 1,
    createdAt: "2026-03-01T10:00:00Z",
    updatedAt: "2026-03-10T10:00:00Z",
    author: { login: "alice" },
    labels: [],
    commentsCount: 0,
    assignees: [],
  },
  {
    repository: { name: "sdk", nameWithOwner: "acme/sdk" },
    title: "B",
    url: "https://github.com/acme/sdk/issues/2",
    number: 2,
    createdAt: "2026-04-15T10:00:00Z",
    updatedAt: "2026-04-22T10:00:00Z",
    author: { login: "bob" },
    labels: [],
    commentsCount: 0,
    assignees: [],
  },
];

describe("insight utilities", () => {
  it("aggregates factual signals and passes through provided counts", () => {
    const insight = buildRepoInsight({
      repo,
      issues,
      viewsCount: 320,
      viewsUniques: 140,
      releaseCount: 4,
      totalDownloads: 900,
      recentDownloads: 120,
      latestReleasePublishedAt: "2026-04-18T10:00:00Z",
      securityAlertsCount: 0,
      now: new Date("2026-04-23T10:00:00Z").getTime(),
    });

    expect(insight.repo).toBe("acme/sdk");
    expect(insight.issueCount).toBe(2);
    expect(insight.viewsCount).toBe(320);
    expect(insight.totalDownloads).toBe(900);
    expect(insight.recentDownloads).toBe(120);
    expect(insight.securityAlertsCount).toBe(0);
    // stars/forks deltas derived from history snapshots (110->120, 12->14)
    expect(insight.starsDelta).toBe(10);
    expect(insight.forksDelta).toBe(2);
    expect(insight.latestReleasePublishedAt).toBe("2026-04-18T10:00:00Z");
  });

  it("counts stale issues and surfaces security availability", () => {
    const insight = buildRepoInsight({
      repo: {
        ...repo,
        pushedAt: "2026-01-01T10:00:00Z",
        updatedAt: "2026-01-01T10:00:00Z",
        history: [],
      },
      issues,
      viewsCount: 280,
      releaseCount: 0,
      totalDownloads: 20,
      securityAlertsCount: 4,
      now: new Date("2026-04-23T10:00:00Z").getTime(),
    });

    // issue A (updated 2026-03-10) is >30d stale; issue B (updated 2026-04-22) is not
    expect(insight.staleIssueCount).toBe(1);
    expect(insight.daysSincePush).toBeGreaterThan(100);
    expect(insight.securityAlertsCount).toBe(4);
    // no history snapshots => deltas are null, not 0
    expect(insight.starsDelta).toBeNull();
    expect(insight.forksDelta).toBeNull();
  });

  it("carries per-metric error reasons when fetches fail", () => {
    const insight = buildRepoInsight({
      repo,
      issues,
      viewsCount: 0,
      totalDownloads: 0,
      securityAlertsCount: 0,
      errors: { views: "HTTP 403", security: "Dependabot: disabled (HTTP 403)" },
      now: new Date("2026-04-23T10:00:00Z").getTime(),
    });

    expect(insight.errors?.views).toBe("HTTP 403");
    expect(insight.errors?.security).toBe("Dependabot: disabled (HTTP 403)");
    expect(insight.errors?.downloads).toBeUndefined();
  });

  it("omits the errors object entirely when everything loaded", () => {
    const insight = buildRepoInsight({
      repo,
      issues,
      viewsCount: 5,
      now: new Date("2026-04-23T10:00:00Z").getTime(),
    });

    expect(insight.errors).toBeUndefined();
  });
});
