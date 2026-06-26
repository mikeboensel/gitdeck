// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));
vi.mock("../../../src/server/localReposData", () => ({
  getLocalReposCached: vi.fn(),
  invalidateLocalReposCache: vi.fn(),
}));
vi.mock("../../../src/server/localReposStore", () => ({
  getScanRoots: vi.fn(),
  getConfig: vi.fn(),
  updateConfig: vi.fn(),
}));

import { execFile } from "node:child_process";
import { app } from "../../../src/server/app";
import { getLocalReposCached, invalidateLocalReposCache } from "../../../src/server/localReposData";
import { getScanRoots } from "../../../src/server/localReposStore";
import type { LocalRepo } from "../../../src/types/github";

const execFileMock = vi.mocked(execFile);
const cachedMock = vi.mocked(getLocalReposCached);
const rootsMock = vi.mocked(getScanRoots);
const invalidateMock = vi.mocked(invalidateLocalReposCache);

const REPO_PATH = "/Users/me/dev/repo-a";

function succeed(...args: unknown[]) {
  (args[args.length - 1] as (e: unknown, r: unknown) => void)(null, { stdout: "", stderr: "" });
}
function fail(message: string) {
  return (...args: unknown[]) =>
    (args[args.length - 1] as (e: unknown) => void)(new Error(message));
}

/** A safe (clean, pushed, remote-backed, no-worktree) scanned repo at REPO_PATH. */
function safeRepo(over: Partial<LocalRepo> = {}): LocalRepo {
  return {
    path: REPO_PATH,
    name: "repo-a",
    remoteUrl: "https://github.com/acme/repo-a.git",
    remotes: [
      {
        name: "origin",
        url: "https://github.com/acme/repo-a.git",
        host: "github.com",
        owner: "acme",
      },
    ],
    nameWithOwner: "acme/repo-a",
    host: "github.com",
    branch: "main",
    ahead: 0,
    behind: 0,
    dirty: false,
    changes: { staged: 0, modified: 0, untracked: 0, conflicted: 0 },
    stashCount: 0,
    lastCommit: { sha: "a1", date: "2026-01-01T00:00:00Z", message: "init" },
    sizeBytes: 1000,
    linkedWorktrees: [],
    isWorktree: false,
    gitCommonDir: `${REPO_PATH}/.git`,
    enrichment: null,
    enrichmentStatus: "local-only",
    ...over,
  };
}

function setRepos(repos: LocalRepo[]) {
  // biome-ignore lint/suspicious/noExplicitAny: test fixture shape is narrower than the real result.
  cachedMock.mockResolvedValue({ ok: true, repos, scannedAt: "t" } as any);
}

function post(body: unknown) {
  return app.request("/api/local-repos/delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  execFileMock.mockReset();
  execFileMock.mockImplementation(succeed as never);
  cachedMock.mockReset();
  setRepos([safeRepo()]);
  rootsMock.mockReset();
  rootsMock.mockResolvedValue(["/Users/me/dev"]);
  invalidateMock.mockReset();
});

describe("POST /api/local-repos/delete", () => {
  it("moves a safe repo to the Trash via osascript and invalidates the cache", async () => {
    const res = await post({ path: REPO_PATH });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(execFileMock.mock.calls[0]?.[0]).toBe("osascript");
    // Path is passed as the trailing argv item, never interpolated into the script.
    const args = execFileMock.mock.calls[0]?.[1] as string[];
    expect(args[args.length - 1]).toBe(REPO_PATH);
    expect(invalidateMock).toHaveBeenCalled();
  });

  it("rejects a path that is not a scanned repo (403, no exec)", async () => {
    const res = await post({ path: "/etc/passwd" });
    expect(res.status).toBe(403);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("refuses to delete a scan root (403, no exec)", async () => {
    rootsMock.mockResolvedValue([REPO_PATH]);
    setRepos([safeRepo()]);
    const res = await post({ path: REPO_PATH });
    expect(res.status).toBe(403);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("refuses an unsafe repo without force (409 with blockers, no exec)", async () => {
    setRepos([safeRepo({ dirty: true })]);
    const res = await post({ path: REPO_PATH });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      ok: false,
      blockers: expect.arrayContaining(["dirty"]),
    });
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("deletes an unsafe repo when force is set", async () => {
    setRepos([safeRepo({ dirty: true })]);
    const res = await post({ path: REPO_PATH, force: true });
    expect(res.status).toBe(200);
    expect(execFileMock.mock.calls[0]?.[0]).toBe("osascript");
  });

  it("returns 500 when the trash command fails", async () => {
    execFileMock.mockImplementation(fail("osascript: Finder got an error") as never);
    const res = await post({ path: REPO_PATH });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false });
  });

  it("returns 500 when the scan itself failed", async () => {
    cachedMock.mockResolvedValue({ ok: false, error: "scan boom" });
    const res = await post({ path: REPO_PATH });
    expect(res.status).toBe(500);
    expect(execFileMock).not.toHaveBeenCalled();
  });
});
