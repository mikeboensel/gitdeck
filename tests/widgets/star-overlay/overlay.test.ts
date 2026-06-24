import { describe, expect, it } from "vitest";
import {
  buildRepoSeries,
  colorForIndex,
  scaleStars,
  seriesDomain,
  seriesPath,
} from "../../../src/components/widgets/star-overlay/overlay";
import type { GhRepo, SnapshotEntry } from "../../../src/types/github";

function repo(nameWithOwner: string, history: SnapshotEntry[]): GhRepo {
  return {
    nameWithOwner,
    name: nameWithOwner.split("/").pop() ?? nameWithOwner,
    owner: { login: nameWithOwner.split("/")[0] ?? nameWithOwner },
    description: null,
    stargazerCount: 0,
    forkCount: 0,
    primaryLanguage: null,
    updatedAt: "",
    pushedAt: "",
    visibility: "public",
    isPrivate: false,
    isArchived: false,
    isFork: false,
    url: "",
    history,
  };
}

function snap(date: string, stars: number): SnapshotEntry {
  return { date, stars, forks: 0 };
}

describe("buildRepoSeries", () => {
  it("drops repos with fewer than two history points", () => {
    const series = buildRepoSeries([
      repo("a/one", [snap("2026-01-01", 5)]),
      repo("a/two", []),
      repo("a/three", [snap("2026-01-01", 1), snap("2026-01-02", 4)]),
    ]);
    expect(series.map((s) => s.repo)).toEqual(["a/three"]);
  });

  it("sorts by latest stars descending and computes delta", () => {
    const series = buildRepoSeries([
      repo("a/small", [snap("2026-01-01", 1), snap("2026-01-03", 10)]),
      repo("a/big", [snap("2026-01-01", 100), snap("2026-01-03", 150)]),
    ]);
    expect(series.map((s) => s.repo)).toEqual(["a/big", "a/small"]);
    expect(series[0]?.latest).toBe(150);
    expect(series[0]?.delta).toBe(50);
    expect(series[1]?.delta).toBe(9);
  });

  it("assigns a stable color by rank", () => {
    const series = buildRepoSeries([
      repo("a/big", [snap("2026-01-01", 100), snap("2026-01-02", 101)]),
      repo("a/small", [snap("2026-01-01", 1), snap("2026-01-02", 2)]),
    ]);
    expect(series[0]?.color).toBe(colorForIndex(0));
    expect(series[1]?.color).toBe(colorForIndex(1));
  });

  it("sorts points chronologically even if history is unordered", () => {
    const series = buildRepoSeries([
      repo("a/one", [snap("2026-01-03", 9), snap("2026-01-01", 3), snap("2026-01-02", 6)]),
    ]);
    expect(series[0]?.points.map((p) => p.stars)).toEqual([3, 6, 9]);
    expect(series[0]?.delta).toBe(6);
  });
});

describe("seriesDomain", () => {
  it("returns null when there are no series", () => {
    expect(seriesDomain([])).toBeNull();
  });

  it("spans the combined min/max across series", () => {
    const series = buildRepoSeries([
      repo("a/one", [snap("2026-01-01", 5), snap("2026-01-04", 20)]),
      repo("a/two", [snap("2026-01-02", 1), snap("2026-01-03", 8)]),
    ]);
    const domain = seriesDomain(series);
    expect(domain?.minStars).toBe(1);
    expect(domain?.maxStars).toBe(20);
    expect(domain?.minT).toBe(Date.parse("2026-01-01"));
    expect(domain?.maxT).toBe(Date.parse("2026-01-04"));
  });
});

describe("scaleStars", () => {
  const domain = { minT: 0, maxT: 10, minStars: 0, maxStars: 100 };

  it("maps max to the top and min to the bottom (linear)", () => {
    expect(scaleStars(100, domain, 200, false)).toBeCloseTo(0);
    expect(scaleStars(0, domain, 200, false)).toBeCloseTo(200);
    expect(scaleStars(50, domain, 200, false)).toBeCloseTo(100);
  });

  it("clamps to 1 under log scale to avoid log(0)", () => {
    const y = scaleStars(0, { ...domain, minStars: 0, maxStars: 1000 }, 200, true);
    expect(Number.isFinite(y)).toBe(true);
  });
});

describe("seriesPath", () => {
  it("starts with a move command and has one vertex per point", () => {
    const [series] = buildRepoSeries([
      repo("a/one", [snap("2026-01-01", 0), snap("2026-01-02", 50), snap("2026-01-03", 100)]),
    ]);
    if (!series) throw new Error("expected a series");
    const domain = seriesDomain([series]);
    if (!domain) throw new Error("expected a domain");
    const path = seriesPath(series, domain, 300, 100, false);
    expect(path.startsWith("M ")).toBe(true);
    expect((path.match(/[ML]/g) ?? []).length).toBe(3);
  });
});
