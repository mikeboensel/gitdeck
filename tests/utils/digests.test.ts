import { describe, expect, it } from "vitest";
import type { DailyDigestEntry, DailyRepoDigest, GhIssue, GhRepo } from "../../src/types/github";
import {
  buildDailyDigestEntries,
  buildDailyDigestMarkdown,
  buildDailyDigestRecord,
  buildDailyRepoDigestMarkdown,
  buildPeriodDigestEntries,
  type DailyDigestRecord,
} from "../../src/utils/digests";

const reposDay1: GhRepo[] = [
  {
    nameWithOwner: "acme/app",
    name: "app",
    owner: { login: "acme" },
    description: null,
    stargazerCount: 10,
    forkCount: 2,
    primaryLanguage: { name: "TypeScript" },
    updatedAt: "2026-04-20T10:00:00Z",
    pushedAt: "2026-04-20T10:00:00Z",
    visibility: "PUBLIC",
    isPrivate: false,
    isArchived: false,
    isFork: false,
    url: "https://github.com/acme/app",
  },
];

const reposDay2: GhRepo[] = [
  {
    ...reposDay1[0]!,
    stargazerCount: 14,
    forkCount: 3,
  },
];

const issuesDay1: GhIssue[] = [
  {
    repository: { name: "app", nameWithOwner: "acme/app" },
    title: "A",
    url: "https://github.com/acme/app/issues/1",
    number: 1,
    createdAt: "2026-04-20T10:00:00Z",
    updatedAt: "2026-04-20T10:00:00Z",
    author: { login: "alice" },
    labels: [],
    commentsCount: 0,
    assignees: [],
  },
];

const issuesDay2: GhIssue[] = [
  ...issuesDay1,
  {
    repository: { name: "app", nameWithOwner: "acme/app" },
    title: "B",
    url: "https://github.com/acme/app/issues/2",
    number: 2,
    createdAt: "2026-04-21T10:00:00Z",
    updatedAt: "2026-04-21T10:00:00Z",
    author: { login: "bob" },
    labels: [],
    commentsCount: 0,
    assignees: [],
  },
];

describe("daily digest utilities", () => {
  it("builds snapshot records from repositories and issues", () => {
    const record = buildDailyDigestRecord(
      reposDay1,
      issuesDay1,
      new Date("2026-04-20T12:00:00Z").getTime(),
      new Map([["acme/app", { securityAlertsCount: 2, securityAlertsUnavailable: false }]]),
    );
    expect(record.date).toBe("2026-04-20");
    expect(record.totalStars).toBe(10);
    expect(record.issueCount).toBe(1);
    expect(record.securityAlertsCount).toBe(2);
    expect(record.securityReposCount).toBe(1);
    expect(record.repos[0]?.issueCount).toBe(1);
  });

  it("computes daily deltas and highlights", () => {
    const day1 = buildDailyDigestRecord(
      reposDay1,
      issuesDay1,
      new Date("2026-04-20T12:00:00Z").getTime(),
      new Map([["acme/app", { securityAlertsCount: 1, securityAlertsUnavailable: false }]]),
    );
    const day2 = buildDailyDigestRecord(
      reposDay2,
      issuesDay2,
      new Date("2026-04-21T12:00:00Z").getTime(),
      new Map([["acme/app", { securityAlertsCount: 3, securityAlertsUnavailable: false }]]),
    );
    const entries = buildDailyDigestEntries([day1, day2]);

    expect(entries[0]?.date).toBe("2026-04-21");
    expect(entries[0]?.starsDelta).toBe(4);
    expect(entries[0]?.issueDelta).toBe(1);
    expect(entries[0]?.securityAlertsCount).toBe(3);
    expect(entries[0]?.repos[0]?.securityAlertsCount).toBe(3);
    expect(entries[0]?.repos[0]?.issueDelta).toBe(1);
    expect(entries[0]?.highlights.length).toBeGreaterThan(0);
  });
});

/** Build a single-repo snapshot record with full control over its numbers/date/ai. */
function makeRecord(
  date: string,
  opts: {
    issueCount?: number;
    staleIssueCount?: number;
    stars?: number;
    forks?: number;
    securityAlertsCount?: number;
    ai?: DailyDigestRecord["ai"];
  } = {},
): DailyDigestRecord {
  const issueCount = opts.issueCount ?? 0;
  const staleIssueCount = opts.staleIssueCount ?? 0;
  const stars = opts.stars ?? 0;
  const forks = opts.forks ?? 0;
  const securityAlertsCount = opts.securityAlertsCount ?? 0;
  return {
    date,
    repoCount: 1,
    issueCount,
    staleIssueCount,
    securityAlertsCount,
    securityReposCount: securityAlertsCount > 0 ? 1 : 0,
    securityAlertsUnavailable: false,
    totalStars: stars,
    totalForks: forks,
    repos: [
      {
        repo: "acme/app",
        stars,
        forks,
        issueCount,
        staleIssueCount,
        securityAlertsCount,
        securityAlertsUnavailable: false,
      },
    ],
    ai: opts.ai ?? null,
  };
}

const AI = {
  model: "test-model",
  headline: "AI headline",
  briefing: ["point one"],
  generatedAt: "2026-04-25T00:00:00Z",
};

describe("buildPeriodDigestEntries / bucketByPeriod", () => {
  it("collapses records in the same ISO week, keeping the latest", () => {
    // 2026-06-22 is a Monday and 2026-06-28 a Sunday (ISO day 7) — same ISO week.
    const entries = buildPeriodDigestEntries(
      [makeRecord("2026-06-22"), makeRecord("2026-06-28"), makeRecord("2026-06-29")],
      "week",
    );
    // Two buckets: {22nd,28th} and {29th}. Latest of the first bucket is the 28th.
    expect(entries.map((e) => e.date)).toEqual(["2026-06-29", "2026-06-28"]);
  });

  it("assigns a year-boundary date to the correct ISO week (2027-01-01 → 2026-W53)", () => {
    // ISO week 53 of 2026 spans Mon 2026-12-28 .. Sun 2027-01-03.
    const sameWeek = buildPeriodDigestEntries(
      [
        makeRecord("2026-12-28"),
        makeRecord("2026-12-31"),
        makeRecord("2027-01-01"),
        makeRecord("2027-01-03"),
      ],
      "week",
    );
    expect(sameWeek).toHaveLength(1);
    expect(sameWeek[0]?.date).toBe("2027-01-03");

    // 2027-01-04 is a Monday — the start of 2027-W01, so it forms a separate bucket.
    const twoWeeks = buildPeriodDigestEntries(
      [makeRecord("2027-01-03"), makeRecord("2027-01-04")],
      "week",
    );
    expect(twoWeeks.map((e) => e.date)).toEqual(["2027-01-04", "2027-01-03"]);
  });

  it("collapses records in the same month, keeping the latest", () => {
    const entries = buildPeriodDigestEntries(
      [makeRecord("2026-04-10"), makeRecord("2026-04-25"), makeRecord("2026-05-02")],
      "month",
    );
    expect(entries.map((e) => e.date)).toEqual(["2026-05-02", "2026-04-25"]);
  });

  it("strips AI narratives on week/month rollups but preserves them per day", () => {
    const records = [makeRecord("2026-04-10", { ai: AI }), makeRecord("2026-04-25", { ai: AI })];

    const daily = buildPeriodDigestEntries(records, "day");
    // The day view keeps each record's AI narrative.
    expect(daily.every((e) => e.ai !== null)).toBe(true);

    const monthly = buildPeriodDigestEntries(records, "month");
    expect(monthly).toHaveLength(1);
    expect(monthly[0]?.ai).toBeNull();
  });
});

const baseEntry: DailyDigestEntry = {
  date: "2026-04-25",
  repoCount: 1,
  issueCount: 3,
  staleIssueCount: 0,
  securityAlertsCount: 2,
  securityReposCount: 1,
  securityAlertsUnavailable: false,
  totalStars: 10,
  totalForks: 2,
  issueDelta: 1,
  staleIssueDelta: 0,
  starsDelta: 1,
  forksDelta: 0,
  highlights: ["Stars +1, forks +0, open issues +1."],
  executiveSummary: ["Tracked 1 repositories."],
  momentum: [],
  risks: [],
  repos: [],
  ai: null,
};
const makeEntry = (overrides: Partial<DailyDigestEntry>): DailyDigestEntry => ({
  ...baseEntry,
  ...overrides,
});

const baseRepoDigest: DailyRepoDigest = {
  repo: "acme/app",
  date: "2026-04-25",
  stars: 10,
  forks: 2,
  issueCount: 3,
  staleIssueCount: 0,
  securityAlertsCount: 0,
  securityAlertsUnavailable: false,
  starsDelta: 0,
  forksDelta: 0,
  issueDelta: 0,
  staleIssueDelta: 0,
  securityAlertsDelta: 0,
  highlights: ["Stars +0, forks +0, open issues +0."],
  executiveSummary: ["acme/app now has 3 open issues, 0 stale."],
  momentum: [],
  risks: [],
  ai: null,
};
const makeRepoDigest = (overrides: Partial<DailyRepoDigest>): DailyRepoDigest => ({
  ...baseRepoDigest,
  ...overrides,
});

describe("toMarkdownDigest (markdown rendering)", () => {
  it("renders the AI block only when ai is set", () => {
    const withAi = buildDailyDigestMarkdown(
      makeEntry({ ai: { model: "m", headline: "Big day", briefing: ["a", "b"], generatedAt: "" } }),
    );
    expect(withAi).toContain("## Big day");
    expect(withAi).toContain("- a");

    const withoutAi = buildDailyDigestMarkdown(makeEntry({ ai: null }));
    expect(withoutAi).not.toContain("## Big day");
  });

  it("emits a Security section whenever securityAlertsCount is a number", () => {
    const md = buildDailyDigestMarkdown(
      makeEntry({ securityAlertsCount: 5, securityReposCount: 2 }),
    );
    expect(md).toContain("## Security");
    expect(md).toContain("- Open security alerts: 5");
    // Digest entries carry securityReposCount, so the affected-repos line appears.
    expect(md).toContain("- Repositories affected: 2");
  });

  it("omits the affected-repos line for per-repo digests (no securityReposCount)", () => {
    const md = buildDailyRepoDigestMarkdown(makeRepoDigest({ securityAlertsCount: 4 }));
    expect(md).toContain("## Security");
    expect(md).toContain("- Open security alerts: 4");
    expect(md).not.toContain("Repositories affected");
  });

  it("does not emit Momentum/Risks headers when those arrays are empty", () => {
    const md = buildDailyDigestMarkdown(makeEntry({ momentum: [], risks: [] }));
    expect(md).not.toContain("## Momentum");
    expect(md).not.toContain("## Risks");
  });

  it("emits Momentum/Risks headers when those arrays are populated", () => {
    const md = buildDailyDigestMarkdown(
      makeEntry({ momentum: ["acme/app: stars +3."], risks: ["acme/app: issues +2."] }),
    );
    expect(md).toContain("## Momentum");
    expect(md).toContain("- acme/app: stars +3.");
    expect(md).toContain("## Risks");
    expect(md).toContain("- acme/app: issues +2.");
  });
});

describe("buildRepoDelta (via buildDailyDigestEntries)", () => {
  it("renders negative deltas without a leading + sign", () => {
    // issueCount drops 5 → 2, everything else flat ⇒ issueDelta = -3.
    const prev = makeRecord("2026-04-24", { issueCount: 5, stars: 10, forks: 2 });
    const curr = makeRecord("2026-04-25", { issueCount: 2, stars: 10, forks: 2 });
    const entries = buildDailyDigestEntries([prev, curr]);

    const repoDelta = entries[0]?.repos[0];
    expect(repoDelta?.issueDelta).toBe(-3);
    // signed(-3) → "-3", never "+-3".
    expect(repoDelta?.executiveSummary[1]).toContain("issues -3");
    expect(repoDelta?.executiveSummary[1]).not.toContain("+-3");
  });

  it("falls back to a no-movement summary when risks and momentum are empty", () => {
    const prev = makeRecord("2026-04-24", { issueCount: 5, stars: 10, forks: 2 });
    const curr = makeRecord("2026-04-25", { issueCount: 2, stars: 10, forks: 2 });
    const entries = buildDailyDigestEntries([prev, curr]);

    // No issue increase, no stars/forks gain, no security ⇒ neither risks nor momentum.
    expect(entries[0]?.repos[0]?.risks).toEqual([]);
    expect(entries[0]?.repos[0]?.momentum).toEqual([]);
    expect(entries[0]?.repos[0]?.executiveSummary[2]).toBe(
      "No major repo-specific movement detected.",
    );
  });

  it("uses the top risk as the executive-summary fallback when risks exist", () => {
    // issueCount rises 2 → 5 ⇒ issueDelta +3 ⇒ a risk line is generated.
    const prev = makeRecord("2026-04-24", { issueCount: 2, stars: 10, forks: 2 });
    const curr = makeRecord("2026-04-25", { issueCount: 5, stars: 10, forks: 2 });
    const entries = buildDailyDigestEntries([prev, curr]);

    const repoDelta = entries[0]?.repos[0];
    expect(repoDelta?.risks[0]).toBe("Open issues +3.");
    expect(repoDelta?.executiveSummary[2]).toBe("Open issues +3.");
  });
});
