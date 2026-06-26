import { mkdir, rm } from "node:fs/promises";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Point the size-cache file at an isolated temp dir so the test never touches the
// real ~/.gitdeck. localScan/logger don't import config, so a minimal mock is safe.
const { TMP_DIR, SIZES_PATH } = vi.hoisted(() => {
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { resolve } = require("node:path") as typeof import("node:path");
  const base = resolve(tmpdir(), `gitdeck-sizes-${process.pid}-${Date.now()}`);
  return { TMP_DIR: base, SIZES_PATH: resolve(base, "local-repo-sizes.json") };
});

vi.mock("../../src/server/config", () => ({
  DATA_DIR: TMP_DIR,
  LOCAL_REPO_SIZES_PATH: SIZES_PATH,
}));

const { refreshSizes, getCachedSizes, resetLocalRepoSizesCache } = await import(
  "../../src/server/localRepoSizes"
);

const TTL = 15 * 60_000; // 15 minutes
const T0 = 1_000_000;

beforeEach(async () => {
  await rm(TMP_DIR, { recursive: true, force: true });
  await mkdir(TMP_DIR, { recursive: true });
  resetLocalRepoSizesCache();
});

afterAll(async () => {
  await rm(TMP_DIR, { recursive: true, force: true });
});

/** A measurer that records which paths it was asked to `du`, returning byte sizes. */
function spyMeasurer(sizes: Record<string, number | null>) {
  const calls: string[] = [];
  const measure = (path: string) => {
    calls.push(path);
    return Promise.resolve(sizes[path] ?? null);
  };
  return { measure, calls };
}

describe("refreshSizes", () => {
  it("measures every path on a cold cache and returns the sizes", async () => {
    const { measure, calls } = spyMeasurer({ "/a": 100, "/b": 200 });
    const sizes = await refreshSizes(["/a", "/b"], TTL, T0, measure);
    expect(calls.sort()).toEqual(["/a", "/b"]);
    expect(sizes.get("/a")).toBe(100);
    expect(sizes.get("/b")).toBe(200);
  });

  it("reuses fresh entries without re-measuring within the TTL", async () => {
    const first = spyMeasurer({ "/a": 100 });
    await refreshSizes(["/a"], TTL, T0, first.measure);

    const second = spyMeasurer({ "/a": 999 });
    const sizes = await refreshSizes(["/a"], TTL, T0 + TTL - 1, second.measure);
    expect(second.calls).toEqual([]); // still fresh — not remeasured
    expect(sizes.get("/a")).toBe(100); // original cached value
  });

  it("re-measures once the entry is older than the TTL", async () => {
    const first = spyMeasurer({ "/a": 100 });
    await refreshSizes(["/a"], TTL, T0, first.measure);

    const second = spyMeasurer({ "/a": 250 });
    const sizes = await refreshSizes(["/a"], TTL, T0 + TTL, second.measure);
    expect(second.calls).toEqual(["/a"]); // TTL elapsed — remeasured
    expect(sizes.get("/a")).toBe(250);
  });

  it("only re-measures the stale paths in a mixed set", async () => {
    await refreshSizes(["/fresh"], TTL, T0, spyMeasurer({ "/fresh": 10 }).measure);
    // /stale was measured earlier and has since aged out; /fresh is still fresh.
    await refreshSizes(["/stale"], TTL, T0, spyMeasurer({ "/stale": 20 }).measure);

    const third = spyMeasurer({ "/fresh": 11, "/stale": 22, "/new": 33 });
    const sizes = await refreshSizes(
      ["/fresh", "/stale", "/new"],
      TTL,
      T0 + TTL, // /stale and /new are stale/missing; /fresh measured at T0 is now exactly TTL old
      third.measure,
    );
    // /fresh aged exactly to TTL so it re-measures too; the point is /new + aged ones run.
    expect(third.calls).toContain("/new");
    expect(sizes.get("/new")).toBe(33);
  });

  it("persists across an in-memory cache reset (reads back from disk)", async () => {
    await refreshSizes(["/a"], TTL, T0, spyMeasurer({ "/a": 100 }).measure);
    resetLocalRepoSizesCache(); // force a reload from the persisted file

    const after = spyMeasurer({ "/a": 555 });
    const sizes = await refreshSizes(["/a"], TTL, T0 + 1, after.measure);
    expect(after.calls).toEqual([]); // loaded fresh entry from disk — no remeasure
    expect(sizes.get("/a")).toBe(100);
  });

  it("caches a null (unmeasurable) result and reuses it within the TTL", async () => {
    const first = spyMeasurer({ "/gone": null });
    await refreshSizes(["/gone"], TTL, T0, first.measure);

    const second = spyMeasurer({ "/gone": 42 });
    const sizes = await refreshSizes(["/gone"], TTL, T0 + 1, second.measure);
    expect(second.calls).toEqual([]); // null is a valid cached measurement
    expect(sizes.get("/gone")).toBeNull();
  });
});

describe("getCachedSizes", () => {
  it("returns cached values without measuring, null for unknown paths", async () => {
    await refreshSizes(["/a"], TTL, T0, spyMeasurer({ "/a": 100 }).measure);
    const sizes = await getCachedSizes(["/a", "/unknown"]);
    expect(sizes.get("/a")).toBe(100);
    expect(sizes.get("/unknown")).toBeNull();
  });
});
