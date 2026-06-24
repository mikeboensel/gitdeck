import { describe, expect, it } from "vitest";
import type { CommitActivityDay } from "../../src/types/github";
import { bucketFor, buildCommitChartData, OTHER_SERIES } from "../../src/utils/commitActivity";

describe("bucketFor", () => {
  it("passes through the day for day granularity", () => {
    expect(bucketFor("2025-06-23", "day")).toBe("2025-06-23");
  });

  it("truncates to YYYY-MM for month granularity", () => {
    expect(bucketFor("2025-06-23", "month")).toBe("2025-06");
  });

  it("snaps to the Monday of the week", () => {
    // 2025-06-23 is a Monday → itself
    expect(bucketFor("2025-06-23", "week")).toBe("2025-06-23");
    // 2025-06-25 (Wed) and 2025-06-29 (Sun) both belong to that Monday's week
    expect(bucketFor("2025-06-25", "week")).toBe("2025-06-23");
    expect(bucketFor("2025-06-29", "week")).toBe("2025-06-23");
    // 2025-06-30 (Mon) starts the next week
    expect(bucketFor("2025-06-30", "week")).toBe("2025-06-30");
  });
});

describe("buildCommitChartData", () => {
  const days: CommitActivityDay[] = [
    { repo: "me/a", date: "2025-06-23", count: 3 },
    { repo: "me/b", date: "2025-06-23", count: 2 },
    { repo: "me/a", date: "2025-06-25", count: 1 },
  ];

  it("stacks multiple repos within the same day bucket", () => {
    const { rows, series } = buildCommitChartData(days, ["me/a", "me/b"], "day");
    expect(series).toEqual(["me/a", "me/b"]);
    expect(rows).toEqual([
      { bucket: "2025-06-23", "me/a": 3, "me/b": 2 },
      { bucket: "2025-06-25", "me/a": 1, "me/b": 0 },
    ]);
  });

  it("merges same-week days into one bucket", () => {
    const { rows } = buildCommitChartData(days, ["me/a", "me/b"], "week");
    expect(rows).toEqual([{ bucket: "2025-06-23", "me/a": 4, "me/b": 2 }]);
  });

  it("rolls repos beyond maxSeries into an Other segment", () => {
    const ranked = ["me/a", "me/b", "me/c"];
    const more: CommitActivityDay[] = [
      { repo: "me/a", date: "2025-06-23", count: 5 },
      { repo: "me/b", date: "2025-06-23", count: 4 },
      { repo: "me/c", date: "2025-06-23", count: 1 },
    ];
    const { rows, series } = buildCommitChartData(more, ranked, "day", 2);
    expect(series).toEqual(["me/a", "me/b", OTHER_SERIES]);
    expect(rows).toEqual([{ bucket: "2025-06-23", "me/a": 5, "me/b": 4, [OTHER_SERIES]: 1 }]);
  });

  it("orders buckets chronologically", () => {
    const unordered: CommitActivityDay[] = [
      { repo: "me/a", date: "2025-06-25", count: 1 },
      { repo: "me/a", date: "2025-06-23", count: 1 },
      { repo: "me/a", date: "2025-07-01", count: 1 },
    ];
    const { rows } = buildCommitChartData(unordered, ["me/a"], "day");
    expect(rows.map((r) => r.bucket)).toEqual(["2025-06-23", "2025-06-25", "2025-07-01"]);
  });

  it("skips zero/negative counts and emits no series when empty", () => {
    const { rows, series } = buildCommitChartData(
      [{ repo: "me/a", date: "2025-06-23", count: 0 }],
      [],
      "day",
    );
    expect(rows).toEqual([]);
    expect(series).toEqual([]);
  });
});
