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
