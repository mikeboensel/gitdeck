// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// Override only gql; keep the rest of the client (AuthRequiredError, restApi, …) real.
vi.mock("../../../src/server/githubClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/server/githubClient")>()),
  gql: vi.fn(),
}));

import { app } from "../../../src/server/app";
import { AuthRequiredError, gql } from "../../../src/server/githubClient";

const gqlMock = vi.mocked(gql);

const forksPayload = {
  repository: {
    forks: {
      totalCount: 1,
      pageInfo: { endCursor: null, hasNextPage: false },
      nodes: [{ nameWithOwner: "a/b" }],
    },
  },
};

const stargazersPayload = {
  repository: {
    stargazers: {
      totalCount: 2,
      pageInfo: { endCursor: "c1", hasNextPage: true },
      edges: [
        { starredAt: "2020-01-01T00:00:00Z", node: { login: "x", avatarUrl: "u", url: "h" } },
      ],
    },
  },
};

beforeEach(() => {
  gqlMock.mockReset();
});

describe("GET /api/forks", () => {
  it("returns ok envelope on success", async () => {
    gqlMock.mockResolvedValue(forksPayload);
    const res = await app.request(
      "/api/forks?repo=octocat/Hello-World&direction=DESC&field=PUSHED_AT",
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, totalCount: 1 });
  });

  it("accepts lowercase enum values (legacy leniency)", async () => {
    gqlMock.mockResolvedValue(forksPayload);
    const res = await app.request("/api/forks?repo=o/r&direction=asc&field=name");
    expect(res.status).toBe(200);
    // gql received the upper-cased values
    expect(gqlMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ direction: "ASC", field: "NAME" }),
    );
  });

  it("rejects an invalid enum with a 400 envelope", async () => {
    const res = await app.request("/api/forks?repo=o/r&field=BOGUS");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe("string");
    expect(gqlMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed repo", async () => {
    const res = await app.request("/api/forks?repo=notarepo");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, error: "invalid repo" });
  });
});

describe("GET /api/stargazers", () => {
  it("returns ok envelope on success", async () => {
    gqlMock.mockResolvedValue(stargazersPayload);
    const res = await app.request("/api/stargazers?repo=o/r");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, totalCount: 2, pageInfo: { hasNextPage: true } });
  });

  it("returns 400 when repo is missing", async () => {
    const res = await app.request("/api/stargazers");
    expect(res.status).toBe(400);
    expect((await res.json()).ok).toBe(false);
  });

  it("maps a generic upstream gql error to 500", async () => {
    gqlMock.mockRejectedValue(new Error("boom"));
    const res = await app.request("/api/stargazers?repo=o/r");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, error: "boom" });
  });

  it("maps an auth error to 401 with needsAuth", async () => {
    gqlMock.mockRejectedValue(new AuthRequiredError("token expired"));
    const res = await app.request("/api/stargazers?repo=o/r");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, needsAuth: true });
  });
});
