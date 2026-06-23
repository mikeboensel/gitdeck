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

function post(body: unknown) {
  return app.request("/api/local-repos/open", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  execFileMock.mockReset();
  execFileMock.mockImplementation(succeed as never);
  cachedMock.mockReset();
  cachedMock.mockResolvedValue({
    ok: true,
    repos: [{ path: REPO_PATH }],
    scannedAt: "t",
    // biome-ignore lint/suspicious/noExplicitAny: test fixture only needs `path`.
  } as any);
});

describe("POST /api/local-repos/open", () => {
  it("opens a known path in Finder via `open <path>`", async () => {
    const res = await post({ path: REPO_PATH, target: "finder" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(execFileMock.mock.calls[0]?.[0]).toBe("open");
    expect(execFileMock.mock.calls[0]?.[1]).toEqual([REPO_PATH]);
  });

  it("opens in Cursor via `open -a Cursor <path>`", async () => {
    const res = await post({ path: REPO_PATH, target: "cursor" });
    expect(res.status).toBe(200);
    expect(execFileMock.mock.calls[0]?.[1]).toEqual(["-a", "Cursor", REPO_PATH]);
  });

  it("rejects a path that is not a scanned repo (403, no exec)", async () => {
    const res = await post({ path: "/etc/passwd", target: "finder" });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ ok: false });
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid target (400, no exec)", async () => {
    const res = await post({ path: REPO_PATH, target: "vim" });
    expect(res.status).toBe(400);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("returns 500 when the open command fails", async () => {
    execFileMock.mockImplementation(fail("Unable to find application named 'Cursor'") as never);
    const res = await post({ path: REPO_PATH, target: "cursor" });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false });
  });

  it("returns 500 when the scan itself failed", async () => {
    cachedMock.mockResolvedValue({ ok: false, error: "scan boom" });
    const res = await post({ path: REPO_PATH, target: "finder" });
    expect(res.status).toBe(500);
    expect(execFileMock).not.toHaveBeenCalled();
  });
});
