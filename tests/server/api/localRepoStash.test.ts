// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));
vi.mock("../../../src/server/localReposData", () => ({
  getLocalReposCached: vi.fn(),
  invalidateLocalReposCache: vi.fn(),
}));

import { execFile } from "node:child_process";
import { app } from "../../../src/server/app";
import { getLocalReposCached } from "../../../src/server/localReposData";

const execFileMock = vi.mocked(execFile);
const cachedMock = vi.mocked(getLocalReposCached);

const REPO_PATH = "/Users/me/dev/repo-a";

/** promisify(execFile) appends a Node-style callback as the last argument. */
function succeed(...args: unknown[]) {
  (args[args.length - 1] as (e: unknown, r: unknown) => void)(null, { stdout: "", stderr: "" });
}
function fail(message: string) {
  return (...args: unknown[]) =>
    (args[args.length - 1] as (e: unknown) => void)(new Error(message));
}

function setRepos(paths: string[]) {
  cachedMock.mockResolvedValue({
    ok: true,
    repos: paths.map((path) => ({ path })),
    scannedAt: "t",
    // biome-ignore lint/suspicious/noExplicitAny: test fixture only needs `path`.
  } as any);
}

function getList(query: Record<string, string>) {
  const qs = new URLSearchParams(query).toString();
  return app.request(`/api/local-repos/stashes?${qs}`);
}
function getDetail(query: Record<string, string>) {
  const qs = new URLSearchParams(query).toString();
  return app.request(`/api/local-repos/stash?${qs}`);
}

beforeEach(() => {
  execFileMock.mockReset();
  execFileMock.mockImplementation(succeed as never);
  cachedMock.mockReset();
  setRepos([REPO_PATH]);
});

describe("isScannedRepo boundary (shared by every stash handler)", () => {
  it("returns 500 when the repo scan itself failed (no git spawn)", async () => {
    cachedMock.mockResolvedValue({ ok: false, error: "scan boom" } as never);
    const res = await getDetail({ path: REPO_PATH, index: "0" });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false });
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("rejects a path that is not a scanned repo (403, no git spawn)", async () => {
    const res = await getDetail({ path: "/etc/passwd", index: "0" });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ ok: false });
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("also guards the list endpoint (403 for an unknown path, no git spawn)", async () => {
    const res = await getList({ path: "/etc/passwd" });
    expect(res.status).toBe(403);
    expect(execFileMock).not.toHaveBeenCalled();
  });
});

describe("indexSchema injection guard (stash detail endpoint)", () => {
  // Crown jewels: a malformed index must be rejected by zod BEFORE the
  // `stash@{N}` revspec is built and any git subprocess is spawned.
  it.each([
    ["non-numeric", "abc"],
    ["oversized (>4 digits)", "12345"],
    ["negative", "-1"],
    ["revspec injection", "0}; rm"],
    ["empty", ""],
  ])("rejects %s index with 400 and never spawns git", async (_label, index) => {
    const res = await getDetail({ path: REPO_PATH, index });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false });
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("accepts a valid index and builds the stash@{N} revspec literally", async () => {
    const res = await getDetail({ path: REPO_PATH, index: "2" });
    expect(res.status).toBe(200);
    // Every spawned git call carries `stash@{2}` as a literal argv item — never
    // interpolated into a shell string.
    const sawRevspec = execFileMock.mock.calls.some((call) =>
      (call[1] as string[]).includes("stash@{2}"),
    );
    expect(sawRevspec).toBe(true);
    expect(execFileMock.mock.calls[0]?.[0]).toBe("git");
  });
});

describe("stash list + detail success / error mapping", () => {
  it("lists stashes for a scanned repo (200)", async () => {
    const res = await getList({ path: REPO_PATH });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, stashes: [] });
    expect(execFileMock.mock.calls[0]?.[1]).toEqual(
      expect.arrayContaining(["-C", REPO_PATH, "stash", "list"]),
    );
  });

  it("returns stash detail (200) for a valid index", async () => {
    const res = await getDetail({ path: REPO_PATH, index: "0" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, files: [], patch: "" });
  });

  it("maps a git failure on list to 500", async () => {
    execFileMock.mockImplementation(fail("fatal: not a git repository") as never);
    const res = await getList({ path: REPO_PATH });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false });
  });

  it("maps a git failure on detail to 500", async () => {
    execFileMock.mockImplementation(fail("fatal: log for 'stash' only has 0 entries") as never);
    const res = await getDetail({ path: REPO_PATH, index: "9" });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false });
  });
});
