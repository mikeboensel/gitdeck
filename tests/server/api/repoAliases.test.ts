// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/server/aliasStore", () => ({
  getAliases: vi.fn(),
  addAlias: vi.fn(),
  removeAlias: vi.fn(),
  resetAliasCache: vi.fn(),
}));

import { addAlias, getAliases, removeAlias } from "../../../src/server/aliasStore";
import { app } from "../../../src/server/app";

const getMock = vi.mocked(getAliases);
const addMock = vi.mocked(addAlias);
const removeMock = vi.mocked(removeAlias);

beforeEach(() => {
  getMock.mockReset();
  addMock.mockReset();
  removeMock.mockReset();
});

describe("GET /api/repo-aliases", () => {
  it("returns the alias list", async () => {
    getMock.mockResolvedValue(["a/b"]);
    const res = await app.request("/api/repo-aliases?repo=o/r");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, aliases: ["a/b"] });
  });

  it("rejects a malformed repo", async () => {
    const res = await app.request("/api/repo-aliases?repo=bad");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: "invalid repo" });
    expect(getMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/repo-aliases", () => {
  it("adds a valid alias", async () => {
    addMock.mockResolvedValue(["a/b", "c/d"]);
    const res = await app.request("/api/repo-aliases?repo=o/r", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ alias: "c/d" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, aliases: ["a/b", "c/d"] });
    expect(addMock).toHaveBeenCalledWith("o/r", "c/d");
  });

  it("rejects an alias not in owner/repo form", async () => {
    const res = await app.request("/api/repo-aliases?repo=o/r", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ alias: "nope" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      ok: false,
      error: "alias must be in 'owner/repo' format",
    });
  });

  it("rejects an alias equal to the repo", async () => {
    const res = await app.request("/api/repo-aliases?repo=o/r", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ alias: "o/r" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      ok: false,
      error: "alias cannot equal the repository name",
    });
  });
});

describe("DELETE /api/repo-aliases", () => {
  it("removes an alias", async () => {
    removeMock.mockResolvedValue([]);
    const res = await app.request("/api/repo-aliases?repo=o/r&alias=c/d", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, aliases: [] });
    expect(removeMock).toHaveBeenCalledWith("o/r", "c/d");
  });

  it("requires an alias", async () => {
    const res = await app.request("/api/repo-aliases?repo=o/r", { method: "DELETE" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: "missing alias" });
  });
});
