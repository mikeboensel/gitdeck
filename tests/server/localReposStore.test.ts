// @vitest-environment node
import { rm } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { TMP_DIR } = vi.hoisted(() => {
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { resolve } = require("node:path") as typeof import("node:path");
  return { TMP_DIR: resolve(tmpdir(), `gitdeck-localrepos-${process.pid}-${Date.now()}`) };
});

vi.mock("../../src/server/config", () => ({
  DATA_DIR: TMP_DIR,
  LOCAL_REPOS_CONFIG_PATH: resolve(TMP_DIR, "local-repos.json"),
}));

const store = await import("../../src/server/localReposStore");

// Mirrors DEFAULT_SIZE_TTL_MINUTES in the source.
const DEFAULT_TTL = 15;

beforeEach(async () => {
  store.resetLocalReposConfigCache();
  await rm(TMP_DIR, { recursive: true, force: true });
});

afterAll(async () => {
  await rm(TMP_DIR, { recursive: true, force: true });
});

describe("localReposStore normalize (via updateConfig/getConfig round-trip)", () => {
  it("filters non-string entries out of array fields", async () => {
    await store.updateConfig({
      // Inject junk a strict caller couldn't, to prove normalize sanitizes on the way in.
      scanRoots: ["/repos/a", 123, null, "/repos/b", { x: 1 }] as unknown as string[],
      excludes: ["node_modules", 42] as unknown as string[],
      denylist: [undefined, "/repos/secret"] as unknown as string[],
    });
    const config = await store.getConfig();
    expect(config.scanRoots).toEqual(["/repos/a", "/repos/b"]);
    expect(config.excludes).toEqual(["node_modules"]);
    expect(config.denylist).toEqual(["/repos/secret"]);
  });

  it("keeps a valid positive sizeCacheTtlMinutes", async () => {
    await store.updateConfig({ sizeCacheTtlMinutes: 30 });
    expect((await store.getConfig()).sizeCacheTtlMinutes).toBe(30);
  });

  it("clamps non-positive / non-finite TTLs to the default", async () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      store.resetLocalReposConfigCache();
      await rm(TMP_DIR, { recursive: true, force: true });
      await store.updateConfig({ sizeCacheTtlMinutes: bad as number });
      expect((await store.getConfig()).sizeCacheTtlMinutes).toBe(DEFAULT_TTL);
    }
  });
});

describe("getScanRoots", () => {
  it("falls back to the home directory when no roots are configured", async () => {
    expect(await store.getScanRoots()).toEqual([homedir()]);
  });

  it("returns the configured roots when present", async () => {
    await store.updateConfig({ scanRoots: ["/repos/a", "/repos/b"] });
    expect(await store.getScanRoots()).toEqual(["/repos/a", "/repos/b"]);
  });
});
