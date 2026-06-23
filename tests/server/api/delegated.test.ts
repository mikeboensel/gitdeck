// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/server/repoInsights", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/server/repoInsights")>()),
  getRepoInsightsCached: vi.fn(),
}));

vi.mock("../../../src/server/githubClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/server/githubClient")>()),
  ghApiJson: vi.fn(),
  restApiPaginate: vi.fn(),
}));

vi.mock("../../../src/server/digests", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/server/digests")>()),
  getLatestRepoDigest: vi.fn(),
}));

vi.mock("../../../src/server/securityAlerts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/server/securityAlerts")>()),
  fetchRepoSecuritySummary: vi.fn(),
}));

import { app } from "../../../src/server/app";
import { getLatestRepoDigest } from "../../../src/server/digests";
import { ghApiJson, restApiPaginate } from "../../../src/server/githubClient";
import { getRepoInsightsCached } from "../../../src/server/repoInsights";
import { fetchRepoSecuritySummary } from "../../../src/server/securityAlerts";

const insightsMock = vi.mocked(getRepoInsightsCached);
const ghMock = vi.mocked(ghApiJson);
const pageMock = vi.mocked(restApiPaginate);
const digestMock = vi.mocked(getLatestRepoDigest);
const securityMock = vi.mocked(fetchRepoSecuritySummary);

beforeEach(() => {
  insightsMock.mockReset();
  ghMock.mockReset();
  pageMock.mockReset();
  digestMock.mockReset();
  securityMock.mockReset();
});

describe("GET /api/repo-insights", () => {
  it("returns 200 with an ETag", async () => {
    insightsMock.mockResolvedValue({ ok: true, generatedAt: "2020-01-01", insights: [] });
    const res = await app.request("/api/repo-insights");
    expect(res.status).toBe(200);
    expect(res.headers.get("ETag")).toMatch(/^W\//);
    expect((await res.json()).ok).toBe(true);
  });

  it("maps a failure to 500", async () => {
    insightsMock.mockResolvedValue({ ok: false, error: "boom" });
    const res = await app.request("/api/repo-insights");
    expect(res.status).toBe(500);
  });
});

describe("GET /api/repo-details", () => {
  it("rejects a malformed repo", async () => {
    const res = await app.request("/api/repo-details?repo=bad");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: "invalid repo" });
  });

  it("aggregates sub-resources into one payload", async () => {
    ghMock.mockResolvedValue({ ok: true, data: {} });
    pageMock.mockResolvedValue({ ok: true, data: [] });
    // biome-ignore lint/suspicious/noExplicitAny: minimal digest/security stubs
    digestMock.mockResolvedValue(null as any);
    // biome-ignore lint/suspicious/noExplicitAny: minimal digest/security stubs
    securityMock.mockResolvedValue({ unavailable: true } as any);
    const res = await app.request("/api/repo-details?repo=o/r");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body).toHaveProperty("meta");
    expect(body).toHaveProperty("errors");
  });
});
