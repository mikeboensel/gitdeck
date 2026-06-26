import { describe, expect, it } from "vitest";
import { aggregate, type RawWorkflowRun, summarizeRun } from "../../src/server/ciHealth";
import type { GhRepo } from "../../src/types/github";

const repo: GhRepo = {
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
};

/** Run aggregate and assert a non-null result, narrowing the type for assertions. */
function agg(runs: RawWorkflowRun[]) {
  const result = aggregate(repo, runs);
  if (!result) throw new Error("expected a non-null aggregate result");
  return result;
}

/** Build a completed run with a given conclusion; timestamps default to a 60s span. */
function run(overrides: Partial<RawWorkflowRun> = {}): RawWorkflowRun {
  return {
    id: 1,
    name: "CI",
    status: "completed",
    conclusion: "success",
    event: "push",
    head_branch: "main",
    html_url: "https://github.com/acme/app/actions/runs/1",
    created_at: "2026-04-22T10:00:00Z",
    updated_at: "2026-04-22T10:01:00Z", // +60s
    run_started_at: "2026-04-22T10:00:00Z",
    ...overrides,
  };
}

describe("summarizeRun", () => {
  it("computes duration in seconds from run_started_at to updated_at", () => {
    const s = summarizeRun(
      run({ run_started_at: "2026-04-22T10:00:00Z", updated_at: "2026-04-22T10:02:30Z" }),
    );
    expect(s.durationSec).toBe(150);
  });

  it("falls back to created_at when run_started_at is absent", () => {
    const s = summarizeRun(
      run({
        run_started_at: null,
        created_at: "2026-04-22T10:00:00Z",
        updated_at: "2026-04-22T10:00:45Z",
      }),
    );
    expect(s.durationSec).toBe(45);
  });

  it("clamps a negative duration (end before start) to 0", () => {
    const s = summarizeRun(
      run({ run_started_at: "2026-04-22T10:05:00Z", updated_at: "2026-04-22T10:00:00Z" }),
    );
    expect(s.durationSec).toBe(0);
  });

  it("returns null duration when a timestamp is unparseable", () => {
    const s = summarizeRun(run({ run_started_at: "not-a-date", updated_at: "also-bad" }));
    expect(s.durationSec).toBeNull();
  });

  it("falls back to 'workflow' when the run name is null", () => {
    expect(summarizeRun(run({ name: null })).workflowName).toBe("workflow");
  });
});

describe("aggregate", () => {
  it("returns null when there are no runs", () => {
    expect(aggregate(repo, [])).toBeNull();
  });

  it("computes successRate on success+failure only, excluding cancelled/skipped/in-progress", () => {
    const runs = [
      run({ conclusion: "success" }),
      run({ conclusion: "success" }),
      run({ conclusion: "success" }),
      run({ conclusion: "failure" }),
      run({ conclusion: "cancelled" }),
      run({ conclusion: "skipped" }),
      run({ status: "in_progress", conclusion: null }),
    ];
    const result = agg(runs);
    // 3 success, 1 failure → denominator is 4, NOT 7. Cancelled/skipped/in-progress excluded.
    expect(result.successRate).toBe(0.75);
    expect(result.successCount).toBe(3);
    expect(result.failureCount).toBe(1);
    expect(result.cancelledCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    expect(result.inProgressCount).toBe(1);
    expect(result.totalRuns).toBe(7);
  });

  it("buckets timed_out, startup_failure, and action_required as failures", () => {
    const runs = [
      run({ conclusion: "timed_out" }),
      run({ conclusion: "startup_failure" }),
      run({ conclusion: "action_required" }),
    ];
    const result = agg(runs);
    expect(result.failureCount).toBe(3);
    expect(result.successRate).toBe(0); // 0 success / 3 failure
  });

  it("buckets neutral and unknown conclusions as skipped", () => {
    const runs = [run({ conclusion: "neutral" }), run({ conclusion: "stale" })];
    const result = agg(runs);
    expect(result.skippedCount).toBe(2);
  });

  it("counts non-completed runs as in-progress and keeps them out of the rate", () => {
    const runs = [
      run({ status: "queued", conclusion: null }),
      run({ status: "in_progress", conclusion: null }),
    ];
    const result = agg(runs);
    expect(result.inProgressCount).toBe(2);
    expect(result.successRate).toBe(0); // no decided runs
  });

  it("captures the FIRST matching run as lastFailure and lastSuccess", () => {
    const runs = [
      run({ id: 10, conclusion: "failure" }),
      run({ id: 11, conclusion: "failure" }),
      run({ id: 12, conclusion: "success" }),
      run({ id: 13, conclusion: "success" }),
    ];
    const result = agg(runs);
    expect(result.lastFailure?.id).toBe(10);
    expect(result.lastSuccess?.id).toBe(12);
    expect(result.lastRun?.id).toBe(10); // runs[0]
  });

  it("averages duration only over runs that have a measurable duration", () => {
    const runs = [
      run({ updated_at: "2026-04-22T10:01:00Z" }), // 60s
      run({ updated_at: "2026-04-22T10:03:00Z" }), // 180s
      run({ run_started_at: "bad", updated_at: "bad" }), // null duration → excluded
    ];
    const result = agg(runs);
    expect(result.avgDurationSec).toBe(120); // (60 + 180) / 2
  });
});
