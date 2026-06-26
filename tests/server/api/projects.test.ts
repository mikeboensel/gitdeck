// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/server/githubClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/server/githubClient")>()),
  gql: vi.fn(),
}));

import { app } from "../../../src/server/app";
import { gql } from "../../../src/server/githubClient";

const gqlMock = vi.mocked(gql);

beforeEach(() => {
  gqlMock.mockReset();
});

describe("GET /api/projects", () => {
  it("aggregates and de-dupes open projects", async () => {
    gqlMock.mockResolvedValue({
      viewer: {
        projectsV2: {
          nodes: [
            {
              id: "p1",
              number: 1,
              title: "Alpha",
              url: "u",
              closed: false,
              shortDescription: null,
              owner: { __typename: "User", login: "z" },
            },
            {
              id: "p1",
              number: 1,
              title: "Alpha",
              url: "u",
              closed: false,
              shortDescription: null,
              owner: { __typename: "User", login: "z" },
            },
            {
              id: "p2",
              number: 2,
              title: "Beta",
              url: "u",
              closed: true,
              shortDescription: null,
              owner: { __typename: "User", login: "a" },
            },
          ],
        },
        repositories: { nodes: [] },
        organizations: { nodes: [] },
      },
    });
    const res = await app.request("/api/projects");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    // p2 is closed → excluded; p1 de-duped → 1 project
    expect(body.projects).toHaveLength(1);
    expect(body.projects[0].id).toBe("p1");
  });

  it("returns 200 with needsScope when the token lacks permission", async () => {
    gqlMock.mockRejectedValue(new Error("your token has not been granted the required scopes"));
    const res = await app.request("/api/projects");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: false, needsScope: true });
  });

  it("returns 500 for a generic error", async () => {
    gqlMock.mockRejectedValue(new Error("network down"));
    const res = await app.request("/api/projects");
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false, needsScope: false });
  });
});

describe("GET /api/project", () => {
  it("rejects an invalid id", async () => {
    const res = await app.request("/api/project?id=bad id!");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: "invalid project id" });
    expect(gqlMock).not.toHaveBeenCalled();
  });

  it("returns a project with paginated items", async () => {
    gqlMock.mockResolvedValue({
      node: {
        id: "PVT_1",
        number: 3,
        title: "Board",
        url: "u",
        closed: false,
        shortDescription: null,
        owner: { __typename: "User", login: "z" },
        fields: { nodes: [{ id: "f1" }] },
        items: {
          totalCount: 1,
          pageInfo: { endCursor: null, hasNextPage: false },
          nodes: [{ id: "i1" }],
        },
      },
    });
    const res = await app.request("/api/project?id=PVT_1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      project: { id: "PVT_1", totalCount: 1, truncated: false },
    });
    expect(body.project.items).toHaveLength(1);
  });
});

describe("POST /api/project/move", () => {
  it("applies a move when optionId is set", async () => {
    gqlMock.mockResolvedValue({});
    const res = await app.request("/api/project/move", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: "p", itemId: "i", fieldId: "f", optionId: "o" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("rejects a missing field", async () => {
    const res = await app.request("/api/project/move", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: "p", itemId: "", fieldId: "f" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false });
    expect(gqlMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/projects (org + linkedRepos aggregation)", () => {
  it("de-dupes across viewer/org sources, accumulates linkedRepos, excludes closed, sorts by owner+title", async () => {
    const proj = (id: string, title: string, login: string, closed = false) => ({
      id,
      number: 1,
      title,
      url: "u",
      closed,
      shortDescription: null,
      owner: { __typename: login === "acme" ? "Organization" : "User", login },
    });
    gqlMock.mockResolvedValue({
      viewer: {
        // shared id pShared appears at viewer level (no repo) and again at org/repo levels.
        projectsV2: {
          nodes: [proj("pShared", "Shared", "zoe"), proj("pClosed", "Gone", "zoe", true)],
        },
        repositories: {
          nodes: [
            {
              nameWithOwner: "zoe/repo-a",
              projectsV2: { nodes: [proj("pShared", "Shared", "zoe")] },
            },
            // org repo nested link contributes a second linked repo to pShared.
            {
              nameWithOwner: "zoe/repo-b",
              projectsV2: { nodes: [proj("pOnlyRepo", "RepoOnly", "abe")] },
            },
          ],
        },
        organizations: {
          nodes: [
            {
              login: "acme",
              // org-level project (no repo link) + closed org project (excluded).
              projectsV2: {
                nodes: [
                  proj("pOrg", "OrgBoard", "acme"),
                  proj("pOrgClosed", "Hidden", "acme", true),
                ],
              },
              repositories: {
                nodes: [
                  // org-repo link for the shared project: third linked repo.
                  {
                    nameWithOwner: "acme/repo-c",
                    projectsV2: { nodes: [proj("pShared", "Shared", "zoe")] },
                  },
                ],
              },
            },
          ],
        },
      },
    });
    const res = await app.request("/api/projects");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    // pShared, pOnlyRepo, pOrg survive; pClosed + pOrgClosed excluded → 3.
    expect(body.projects).toHaveLength(3);
    const ids = body.projects.map((p: { id: string }) => p.id);
    // sorted by owner login: "abe" (pOnlyRepo) < "acme" (pOrg) < "zoe" (pShared).
    expect(ids).toEqual(["pOnlyRepo", "pOrg", "pShared"]);

    const shared = body.projects.find((p: { id: string }) => p.id === "pShared");
    // linkedRepos accumulated across repo + org-repo paths, de-duped + sorted.
    expect(shared.linkedRepos).toEqual(["acme/repo-c", "zoe/repo-a"]);

    const orgOnly = body.projects.find((p: { id: string }) => p.id === "pOrg");
    expect(orgOnly.linkedRepos).toEqual([]); // org-level project has no repo link
  });

  it("tolerates null/missing repositories + organizations nodes", async () => {
    gqlMock.mockResolvedValue({
      viewer: {
        projectsV2: { nodes: [] },
        // repositories omitted entirely; organizations has empty nodes.
        organizations: { nodes: [] },
      },
    });
    const res = await app.request("/api/projects");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, projects: [] });
  });
});

describe("GET /api/project (pagination)", () => {
  const page = (
    nodes: unknown[],
    totalCount: number,
    hasNextPage: boolean,
    endCursor: string | null,
  ) => ({
    node: {
      id: "PVT_1",
      number: 3,
      title: "Board",
      url: "u",
      closed: false,
      shortDescription: null,
      owner: { __typename: "User", login: "z" },
      fields: { nodes: [] },
      items: { totalCount, pageInfo: { endCursor, hasNextPage }, nodes },
    },
  });

  it("follows the multi-page loop, passing the endCursor to the next call", async () => {
    gqlMock
      .mockResolvedValueOnce(page([{ id: "i1" }], 2, true, "c1"))
      .mockResolvedValueOnce(page([{ id: "i2" }], 2, false, null));
    const res = await app.request("/api/project?id=PVT_1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.project.items).toHaveLength(2);
    expect(body.project.totalCount).toBe(2);
    expect(body.project.truncated).toBe(false);
    expect(gqlMock).toHaveBeenCalledTimes(2);
    // second call advances using the first page's endCursor.
    expect(gqlMock.mock.calls[1]?.[1]).toMatchObject({ id: "PVT_1", cursor: "c1" });
  });

  it("caps at MAX_ITEMS and flags truncated when more remain", async () => {
    const bigNodes = Array.from({ length: 500 }, (_, i) => ({ id: `i${i}` }));
    // 500 items with hasNextPage true → loop breaks on the cap, single gql call.
    gqlMock.mockResolvedValueOnce(page(bigNodes, 600, true, "cNext"));
    const res = await app.request("/api/project?id=PVT_1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.project.items).toHaveLength(500);
    expect(body.project.totalCount).toBe(600);
    expect(body.project.truncated).toBe(true); // 500 < 600
    expect(gqlMock).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/project/move (mutation selection)", () => {
  it("uses MOVE_MUTATION when optionId is present", async () => {
    gqlMock.mockResolvedValue({});
    const res = await app.request("/api/project/move", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: "p", itemId: "i", fieldId: "f", optionId: "o" }),
    });
    expect(res.status).toBe(200);
    expect(gqlMock).toHaveBeenCalledTimes(1);
    expect(gqlMock.mock.calls[0]?.[0]).toContain("updateProjectV2ItemFieldValue");
    expect(gqlMock.mock.calls[0]?.[1]).toMatchObject({ optionId: "o" });
  });

  it("uses CLEAR_FIELD_MUTATION when optionId is null", async () => {
    gqlMock.mockResolvedValue({});
    const res = await app.request("/api/project/move", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: "p", itemId: "i", fieldId: "f", optionId: null }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(gqlMock).toHaveBeenCalledTimes(1);
    expect(gqlMock.mock.calls[0]?.[0]).toContain("clearProjectV2ItemFieldValue");
    // the clear path never forwards an optionId variable.
    expect(gqlMock.mock.calls[0]?.[1]).not.toHaveProperty("optionId");
  });

  it("uses CLEAR_FIELD_MUTATION when optionId is omitted", async () => {
    gqlMock.mockResolvedValue({});
    const res = await app.request("/api/project/move", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: "p", itemId: "i", fieldId: "f" }),
    });
    expect(res.status).toBe(200);
    expect(gqlMock.mock.calls[0]?.[0]).toContain("clearProjectV2ItemFieldValue");
  });
});
