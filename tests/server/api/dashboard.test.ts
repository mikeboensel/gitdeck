// @vitest-environment node
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/server/dashboardData", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/server/dashboardData")>()),
  getReposCached: vi.fn(),
  getIssuesCached: vi.fn(),
  getPullRequestsCached: vi.fn(),
}));

vi.mock("../../../src/server/ciHealth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/server/ciHealth")>()),
  getCIHealthCached: vi.fn(),
}));

import { app } from "../../../src/server/app";
import { getCIHealthCached } from "../../../src/server/ciHealth";
import { getReposCached } from "../../../src/server/dashboardData";

const reposMock = vi.mocked(getReposCached);
const ciMock = vi.mocked(getCIHealthCached);

/** Recompute the legacy weak ETag to prove byte-identical caching. */
function weakEtag(payload: unknown): string {
  return `W/"${createHash("sha1").update(JSON.stringify(payload)).digest("base64url")}"`;
}

beforeEach(() => {
  reposMock.mockReset();
  ciMock.mockReset();
});

describe("GET /api/repos (cached + ETag)", () => {
  const payload = { ok: true as const, repos: [], owners: ["o"], fetchedAt: "2020-01-01" };

  it("returns 200 with a weak ETag matching the legacy algorithm", async () => {
    reposMock.mockResolvedValue(payload);
    const res = await app.request("/api/repos");
    expect(res.status).toBe(200);
    expect(res.headers.get("ETag")).toBe(weakEtag(payload));
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual(payload);
  });

  it("returns 304 when If-None-Match matches", async () => {
    reposMock.mockResolvedValue(payload);
    const etag = weakEtag(payload);
    const res = await app.request("/api/repos", { headers: { "If-None-Match": etag } });
    expect(res.status).toBe(304);
    expect(res.headers.get("ETag")).toBe(etag);
    expect(await res.text()).toBe("");
  });

  it("passes fresh=1 through to the cache", async () => {
    reposMock.mockResolvedValue(payload);
    await app.request("/api/repos?fresh=1");
    expect(reposMock).toHaveBeenCalledWith(true);
    await app.request("/api/repos");
    expect(reposMock).toHaveBeenCalledWith(false);
  });

  it("maps needsAuth to 401 without an ETag (not cached)", async () => {
    reposMock.mockResolvedValue({ ok: false, error: "auth", needsAuth: true });
    const res = await app.request("/api/repos");
    expect(res.status).toBe(401);
    expect(res.headers.get("ETag")).toBeNull();
    expect(await res.json()).toMatchObject({ ok: false, needsAuth: true });
  });

  it("maps a generic failure to 500", async () => {
    reposMock.mockResolvedValue({ ok: false, error: "boom" });
    const res = await app.request("/api/repos");
    expect(res.status).toBe(500);
  });
});

describe("GET /api/ci-health (cached)", () => {
  it("returns 200 with the payload", async () => {
    ciMock.mockResolvedValue({ ok: true, repos: [], fetchedAt: "2020-01-01" });
    const res = await app.request("/api/ci-health");
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });
});
