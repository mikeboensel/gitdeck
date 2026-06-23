// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/server/githubClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/server/githubClient")>()),
  restApi: vi.fn(),
  ghApiJson: vi.fn(),
  getToken: vi.fn(),
}));

vi.mock("../../../src/server/aliasStore", () => ({
  getAliases: vi.fn(),
  addAlias: vi.fn(),
  removeAlias: vi.fn(),
  resetAliasCache: vi.fn(),
}));

import { getAliases } from "../../../src/server/aliasStore";
import { app } from "../../../src/server/app";
import { getToken, ghApiJson, restApi } from "../../../src/server/githubClient";

const restMock = vi.mocked(restApi);
const ghMock = vi.mocked(ghApiJson);
const tokenMock = vi.mocked(getToken);
const aliasMock = vi.mocked(getAliases);

beforeEach(() => {
  restMock.mockReset();
  ghMock.mockReset();
  tokenMock.mockReset();
  aliasMock.mockReset();
  aliasMock.mockResolvedValue([]);
});

describe("GET /api/mentions/issues", () => {
  it("returns mapped items, excluding the repo itself", async () => {
    restMock.mockResolvedValue({
      ok: true,
      data: {
        items: [
          {
            number: 1,
            title: "x",
            html_url: "h",
            state: "open",
            repository_url: "https://api.github.com/repos/other/repo",
            created_at: "t",
            updated_at: "t",
          },
          {
            number: 2,
            title: "self",
            html_url: "h",
            state: "open",
            repository_url: "https://api.github.com/repos/o/r",
            created_at: "t",
            updated_at: "t",
          },
        ],
      },
    });
    const res = await app.request("/api/mentions/issues?repo=o/r");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.totalCount).toBe(1);
    expect(body.items[0].repository.nameWithOwner).toBe("other/repo");
  });

  it("maps a 401 to needsAuth", async () => {
    restMock.mockResolvedValue({ ok: false, error: "nope", status: 401 });
    const res = await app.request("/api/mentions/issues?repo=o/r");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, needsAuth: true });
  });

  it("rejects a malformed repo", async () => {
    const res = await app.request("/api/mentions/issues?repo=bad");
    expect(res.status).toBe(400);
    expect(restMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/mentions/referrers", () => {
  it("aggregates traffic endpoints and flags forbidden", async () => {
    ghMock.mockResolvedValue({ ok: false, error: "403 forbidden", status: 403 });
    const res = await app.request("/api/mentions/referrers?repo=o/r");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, forbidden: true });
  });
});

describe("GET /api/mentions/dependents", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns notAvailable on a 404 page", async () => {
    tokenMock.mockResolvedValue("tok");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 404, ok: false }));
    const res = await app.request("/api/mentions/dependents?repo=o/r&type=REPOSITORY");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, notAvailable: true, items: [] });
  });

  it("parses dependents from HTML", async () => {
    tokenMock.mockResolvedValue("tok");
    const html = `42 Repositories
      <div class="Box-row d-flex flex-items-center" >
        <a data-hovercard-type="repository" href="/acme/widget">acme/widget</a>
        <svg class="octicon-star"></svg> 1,200
        <svg class="octicon-repo-forked"></svg> 34
        <img class="avatar" src="https://avatars/x.png" />
      </div>`;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 200, ok: true, text: async () => html }),
    );
    const res = await app.request("/api/mentions/dependents?repo=o/r");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.totalRepos).toBe(42);
    expect(body.items[0]).toMatchObject({ nameWithOwner: "acme/widget", stars: 1200, forks: 34 });
  });

  it("rejects an invalid type", async () => {
    const res = await app.request("/api/mentions/dependents?repo=o/r&type=BOGUS");
    expect(res.status).toBe(400);
    expect((await res.json()).ok).toBe(false);
  });

  it("maps a non-OK GitHub status to 502", async () => {
    tokenMock.mockResolvedValue("tok");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 500, ok: false }));
    const res = await app.request("/api/mentions/dependents?repo=o/r");
    expect(res.status).toBe(502);
    expect((await res.json()).ok).toBe(false);
  });
});
