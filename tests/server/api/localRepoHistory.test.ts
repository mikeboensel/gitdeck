// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));
vi.mock("../../../src/server/localReposData", () => ({
  getLocalReposCached: vi.fn(),
  invalidateLocalReposCache: vi.fn(),
}));

import { execFile } from "node:child_process";
import { app } from "../../../src/server/app";
import { getLocalReposCached, invalidateLocalReposCache } from "../../../src/server/localReposData";

const execFileMock = vi.mocked(execFile);
const cachedMock = vi.mocked(getLocalReposCached);
const invalidateMock = vi.mocked(invalidateLocalReposCache);

const REPO_PATH = "/Users/me/dev/repo-a";
const SHA = "a1b2c3d"; // 7 hex chars — the shortest the schema accepts.

/** promisify(execFile) appends a Node-style callback as the last argument. */
function succeed(...args: unknown[]) {
  (args[args.length - 1] as (e: unknown, r: unknown) => void)(null, { stdout: "", stderr: "" });
}
function fail(message: string) {
  return (...args: unknown[]) =>
    (args[args.length - 1] as (e: unknown) => void)(new Error(message));
}

/** Drive `git(path, args)` calls by their git subcommand so we can vary
 * `status --porcelain` output without touching the checkout call. */
function gitImpl(stdoutFor: (args: string[]) => string) {
  return (...args: unknown[]) => {
    const argv = (args[1] as string[]) ?? [];
    const cb = args[args.length - 1] as (e: unknown, r: unknown) => void;
    cb(null, { stdout: stdoutFor(argv), stderr: "" });
  };
}

function setRepos(paths: string[]) {
  cachedMock.mockResolvedValue({
    ok: true,
    repos: paths.map((path) => ({ path })),
    scannedAt: "t",
    // biome-ignore lint/suspicious/noExplicitAny: test fixture only needs `path`.
  } as any);
}

function getCommit(query: Record<string, string>) {
  const qs = new URLSearchParams(query).toString();
  return app.request(`/api/local-repos/commit?${qs}`);
}

function postCreateBranch(body: unknown) {
  return app.request("/api/local-repos/create-branch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  execFileMock.mockReset();
  execFileMock.mockImplementation(succeed as never);
  cachedMock.mockReset();
  setRepos([REPO_PATH]);
  invalidateMock.mockReset();
});

describe("isScannedRepo boundary (shared by every history handler)", () => {
  it("returns 500 when the repo scan itself failed (no git spawn)", async () => {
    cachedMock.mockResolvedValue({ ok: false, error: "scan boom" } as never);
    const res = await postCreateBranch({ path: REPO_PATH, sha: SHA, name: "feat" });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false });
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("rejects a path that is not a scanned repo (403, no git spawn)", async () => {
    const res = await postCreateBranch({ path: "/etc/passwd", sha: SHA, name: "feat" });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ ok: false });
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("also guards the commit endpoint (403 for an unknown path, no git spawn)", async () => {
    const res = await getCommit({ path: "/etc/passwd", sha: SHA });
    expect(res.status).toBe(403);
    expect(execFileMock).not.toHaveBeenCalled();
  });
});

describe("shaSchema injection guard (commit endpoint)", () => {
  // The crown jewels: a malformed sha must be rejected by zod BEFORE any git
  // subprocess is spawned.
  it.each([
    ["too short", "abc"],
    ["path traversal", "../../etc"],
    ["shell metachars", "HEAD;rm"],
    ["a ref name", "main"],
    ["over 40 chars", "a".repeat(41)],
    ["empty", ""],
  ])("rejects %s sha with 400 and never spawns git", async (_label, sha) => {
    const res = await getCommit({ path: REPO_PATH, sha });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false });
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("accepts a valid hex sha and proceeds to spawn git", async () => {
    const res = await getCommit({ path: REPO_PATH, sha: SHA });
    expect(res.status).toBe(200);
    // The guard passed: at least one `git -C <path> ...` subprocess ran.
    expect(execFileMock).toHaveBeenCalled();
    expect(execFileMock.mock.calls[0]?.[0]).toBe("git");
    expect(execFileMock.mock.calls[0]?.[1]).toEqual(expect.arrayContaining(["-C", REPO_PATH]));
  });
});

describe("branchNameSchema injection guard (create-branch endpoint)", () => {
  it.each([
    ["leading dash (looks like a git option)", "-rf"],
    ["double dot", "feat..bar"],
    ["trailing slash", "feat/"],
    ['".lock" suffix', "feat.lock"],
    ["shell metachars", "feat;rm"],
    ["empty", ""],
  ])("rejects %s with 400 and never spawns git", async (_label, name) => {
    const res = await postCreateBranch({ path: REPO_PATH, sha: SHA, name });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false });
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("also rejects a malformed sha on create-branch with 400 (no git spawn)", async () => {
    const res = await postCreateBranch({ path: REPO_PATH, sha: "HEAD;rm", name: "feat" });
    expect(res.status).toBe(400);
    expect(execFileMock).not.toHaveBeenCalled();
  });
});

describe("POST create-branch dirty-tree guard", () => {
  it("refuses with 409 when the working tree is dirty (no checkout, no invalidate)", async () => {
    // `git status --porcelain` reports a modified file → dirty.
    execFileMock.mockImplementation(
      gitImpl((argv) => (argv.includes("status") ? "M src/x.ts\n" : "")) as never,
    );
    const res = await postCreateBranch({ path: REPO_PATH, sha: SHA, name: "feat" });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false });
    // The status check ran, but `checkout -b` must NOT have.
    const ranCheckout = execFileMock.mock.calls.some((call) =>
      (call[1] as string[]).includes("checkout"),
    );
    expect(ranCheckout).toBe(false);
    expect(invalidateMock).not.toHaveBeenCalled();
  });

  it("creates the branch on a clean tree and invalidates the local-repos cache", async () => {
    // Default `succeed` returns empty stdout → clean status → proceeds.
    const res = await postCreateBranch({ path: REPO_PATH, sha: SHA, name: "feat/new" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, branch: "feat/new" });
    const ranCheckout = execFileMock.mock.calls.some((call) => {
      const argv = call[1] as string[];
      return argv.includes("checkout") && argv.includes("feat/new") && argv.includes(SHA);
    });
    expect(ranCheckout).toBe(true);
    expect(invalidateMock).toHaveBeenCalled();
  });

  it("maps a git failure to 500", async () => {
    execFileMock.mockImplementation(fail("fatal: not a git repository") as never);
    const res = await postCreateBranch({ path: REPO_PATH, sha: SHA, name: "feat" });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false });
  });
});
