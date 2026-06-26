// @vitest-environment node
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));
vi.mock("node:fs/promises", () => ({ readdir: vi.fn(), readFile: vi.fn() }));
vi.mock("../../../src/server/localReposData", () => ({
  getLocalReposCached: vi.fn(),
  invalidateLocalReposCache: vi.fn(),
}));
vi.mock("../../../src/server/localReposStore", () => ({
  getScanRoots: vi.fn(),
  getConfig: vi.fn(),
  updateConfig: vi.fn(),
}));
vi.mock("../../../src/server/localRepoSizes", () => ({ refreshSizes: vi.fn() }));

import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { app } from "../../../src/server/app";
import { refreshSizes } from "../../../src/server/localRepoSizes";
import { getLocalReposCached, invalidateLocalReposCache } from "../../../src/server/localReposData";
import { getConfig, getScanRoots, updateConfig } from "../../../src/server/localReposStore";

const execFileMock = vi.mocked(execFile);
const readdirMock = vi.mocked(readdir);
const cachedMock = vi.mocked(getLocalReposCached);
const invalidateMock = vi.mocked(invalidateLocalReposCache);
const rootsMock = vi.mocked(getScanRoots);
const configMock = vi.mocked(getConfig);
const updateConfigMock = vi.mocked(updateConfig);
const refreshSizesMock = vi.mocked(refreshSizes);

const HOME = homedir();

/** promisify(execFile) appends a Node-style callback as the last argument. */
function execSucceed(...args: unknown[]) {
  (args[args.length - 1] as (e: unknown, r: unknown) => void)(null, { stdout: "", stderr: "" });
}

/** A Dirent-like object good enough for listChildDirs' filters. */
function dirent(name: string, isDir = true, isLink = false) {
  return { name, isDirectory: () => isDir, isSymbolicLink: () => isLink };
}

beforeEach(() => {
  execFileMock.mockReset();
  execFileMock.mockImplementation(execSucceed as never);
  readdirMock.mockReset();
  cachedMock.mockReset();
  invalidateMock.mockReset();
  rootsMock.mockReset();
  configMock.mockReset();
  updateConfigMock.mockReset();
  refreshSizesMock.mockReset();
  // Sensible defaults; individual tests override.
  configMock.mockResolvedValue({
    scanRoots: ["/existing-root"],
    excludes: [],
    denylist: [],
    sizeCacheTtlMinutes: 60,
    // biome-ignore lint/suspicious/noExplicitAny: store config fixture is intentionally minimal.
  } as any);
  updateConfigMock.mockResolvedValue({} as never);
});

// ── POST /api/local-repos/clone ──────────────────────────────────────────────

function clone(body: unknown) {
  return app.request("/api/local-repos/clone", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/local-repos/clone", () => {
  const url = "https://github.com/acme/widget.git";
  const nameWithOwner = "acme/widget";

  it("rejects a destination outside the home directory (403, no readdir/exec)", async () => {
    const res = await clone({ nameWithOwner, url, destDir: "/etc/evil" });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ ok: false });
    expect(readdirMock).not.toHaveBeenCalled();
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("refuses to clone onto a non-empty destination directory (409)", async () => {
    const destDir = join(HOME, "dev");
    readdirMock.mockResolvedValue(["something"] as never);
    const res = await clone({ nameWithOwner, url, destDir });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false });
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("swallows ENOENT on the destination stat and proceeds to clone", async () => {
    const destDir = join(HOME, "dev");
    const enoent = Object.assign(new Error("no such dir"), { code: "ENOENT" });
    readdirMock.mockRejectedValue(enoent);
    // Destination is already covered by a scan root, so no store update happens.
    rootsMock.mockResolvedValue([destDir]);

    const res = await clone({ nameWithOwner, url, destDir });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, path: join(destDir, "widget") });
    expect(execFileMock).toHaveBeenCalledTimes(1);
    expect(invalidateMock).toHaveBeenCalled();
  });

  it("returns 500 for a non-ENOENT filesystem error on the destination", async () => {
    const destDir = join(HOME, "dev");
    const eacces = Object.assign(new Error("permission denied"), { code: "EACCES" });
    readdirMock.mockRejectedValue(eacces);
    const res = await clone({ nameWithOwner, url, destDir });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false });
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("does NOT add a scan root when the destination is already covered", async () => {
    const destDir = join(HOME, "dev");
    const enoent = Object.assign(new Error("no such dir"), { code: "ENOENT" });
    readdirMock.mockRejectedValue(enoent);
    rootsMock.mockResolvedValue([HOME]); // HOME covers HOME/dev

    const res = await clone({ nameWithOwner, url, destDir });
    expect(res.status).toBe(200);
    expect(updateConfigMock).not.toHaveBeenCalled();
  });

  it("appends a new scan root when the destination is NOT covered", async () => {
    const destDir = join(HOME, "dev");
    const enoent = Object.assign(new Error("no such dir"), { code: "ENOENT" });
    readdirMock.mockRejectedValue(enoent);
    rootsMock.mockResolvedValue(["/some/unrelated/root"]);

    const res = await clone({ nameWithOwner, url, destDir });
    expect(res.status).toBe(200);
    expect(updateConfigMock).toHaveBeenCalledTimes(1);
    expect(updateConfigMock).toHaveBeenCalledWith({
      scanRoots: ["/existing-root", resolve(destDir)],
    });
  });

  it("returns 500 when the clone subprocess fails", async () => {
    const destDir = join(HOME, "dev");
    const enoent = Object.assign(new Error("no such dir"), { code: "ENOENT" });
    readdirMock.mockRejectedValue(enoent);
    execFileMock.mockImplementation(((...args: unknown[]) =>
      (args[args.length - 1] as (e: unknown) => void)(new Error("clone boom"))) as never);
    const res = await clone({ nameWithOwner, url, destDir });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false });
    expect(updateConfigMock).not.toHaveBeenCalled();
    expect(invalidateMock).not.toHaveBeenCalled();
  });
});

// ── GET /api/local-repos/browse ──────────────────────────────────────────────

function browse(path?: string) {
  const qs = path === undefined ? "" : `?path=${encodeURIComponent(path)}`;
  return app.request(`/api/local-repos/browse${qs}`);
}

describe("GET /api/local-repos/browse", () => {
  it("rejects a path outside the home directory (403, no readdir)", async () => {
    const res = await browse("/etc");
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ ok: false });
    expect(readdirMock).not.toHaveBeenCalled();
  });

  it("lists child directories and computes a null parent at the home root", async () => {
    readdirMock.mockResolvedValue([
      dirent("alpha"),
      dirent(".hidden"),
      dirent("file.txt", false),
      dirent("link", true, true),
    ] as never);
    const res = await browse(HOME);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, path: resolve(HOME), parent: null });
    expect(body.entries).toEqual([{ name: "alpha", path: join(resolve(HOME), "alpha") }]);
  });

  it("computes the parent for a directory below the home root", async () => {
    const dir = join(HOME, "dev");
    readdirMock.mockResolvedValue([dirent("repo")] as never);
    const res = await browse(dir);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, path: resolve(dir), parent: resolve(HOME) });
    expect(body.entries).toEqual([{ name: "repo", path: join(resolve(dir), "repo") }]);
  });

  it("returns 500 when the directory cannot be read", async () => {
    readdirMock.mockRejectedValue(new Error("readdir boom"));
    const res = await browse(join(HOME, "dev"));
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false });
  });

  it("defaults to the home directory when no path is given", async () => {
    readdirMock.mockResolvedValue([] as never);
    const res = await browse();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ path: resolve(HOME), parent: null });
  });
});

// ── GET /api/local-repos/sizes ───────────────────────────────────────────────

describe("GET /api/local-repos/sizes", () => {
  it("passes a scan failure through as a 500", async () => {
    cachedMock.mockResolvedValue({ ok: false, error: "scan boom" });
    const res = await app.request("/api/local-repos/sizes");
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false, error: "scan boom" });
    expect(refreshSizesMock).not.toHaveBeenCalled();
  });

  it("returns TTL-cached sizes keyed by path on success", async () => {
    cachedMock.mockResolvedValue({
      ok: true,
      repos: [{ path: "/r/a" }, { path: "/r/b" }],
      scannedAt: "t",
      // biome-ignore lint/suspicious/noExplicitAny: fixture only needs `path`.
    } as any);
    refreshSizesMock.mockResolvedValue(
      new Map([
        ["/r/a", 10],
        ["/r/b", null],
      ]),
    );
    const res = await app.request("/api/local-repos/sizes");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, sizes: { "/r/a": 10, "/r/b": null } });
    // TTL is configured minutes converted to ms.
    expect(refreshSizesMock).toHaveBeenCalledWith(["/r/a", "/r/b"], 60 * 60_000);
  });
});
