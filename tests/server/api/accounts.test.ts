// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/server/accountStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/server/accountStore")>()),
  init: vi.fn().mockResolvedValue(undefined),
  add: vi.fn(),
  remove: vi.fn(),
  setActive: vi.fn(),
  getProviderConfig: vi.fn(),
}));

vi.mock("../../../src/server/providers/registry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/server/providers/registry")>()),
  getProvider: vi.fn(),
}));

import { add, getProviderConfig, remove, setActive } from "../../../src/server/accountStore";
import { app } from "../../../src/server/app";
import { getProvider } from "../../../src/server/providers/registry";

const addMock = vi.mocked(add);
const removeMock = vi.mocked(remove);
const setActiveMock = vi.mocked(setActive);
const getProviderConfigMock = vi.mocked(getProviderConfig);
const getProviderMock = vi.mocked(getProvider);

function postJson(path: string, body: string) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const GH_CONFIG = {
  id: "github.com",
  kind: "github" as const,
  label: "GitHub",
  baseUrl: "https://api.github.com",
  webUrl: "https://github.com",
  userAgent: "gitdeck",
};

const FJ_CONFIG = {
  id: "codeberg.org",
  kind: "forgejo" as const,
  label: "Codeberg",
  baseUrl: "https://codeberg.org/api/v1",
  webUrl: "https://codeberg.org",
  userAgent: "gitdeck",
};

/** A provider mock whose fetchIdentity is the only thing the route touches here. */
// biome-ignore lint/suspicious/noExplicitAny: test stub only needs fetchIdentity.
function providerWithIdentity(identity: unknown): any {
  return { fetchIdentity: vi.fn().mockResolvedValue(identity) };
}

beforeEach(() => {
  addMock.mockReset();
  removeMock.mockReset();
  setActiveMock.mockReset();
  getProviderConfigMock.mockReset();
  getProviderMock.mockReset();
  // add() echoes back the account it is given so the route returns the constructed id.
  addMock.mockImplementation(async (account) => account);
});

describe("POST /api/accounts/add-token", () => {
  it("returns 400 on invalid JSON", async () => {
    const res = await postJson("/api/accounts/add-token", "not json");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: "invalid JSON" });
  });

  it("returns 400 when providerConfigId is missing", async () => {
    const res = await postJson("/api/accounts/add-token", JSON.stringify({ token: "t" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "missing providerConfigId" });
  });

  it("returns 400 when token is missing", async () => {
    const res = await postJson(
      "/api/accounts/add-token",
      JSON.stringify({ providerConfigId: "github.com" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "missing token" });
  });

  it("returns 404 for an unknown providerConfigId", async () => {
    getProviderConfigMock.mockResolvedValue(null);
    const res = await postJson(
      "/api/accounts/add-token",
      JSON.stringify({ providerConfigId: "nope", token: "t" }),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "unknown providerConfigId" });
  });

  it("returns 400 when fetchIdentity throws", async () => {
    getProviderConfigMock.mockResolvedValue(GH_CONFIG);
    getProviderMock.mockResolvedValue({
      fetchIdentity: vi.fn().mockRejectedValue(new Error("bad credentials")),
      // biome-ignore lint/suspicious/noExplicitAny: test stub.
    } as any);
    const res = await postJson(
      "/api/accounts/add-token",
      JSON.stringify({ providerConfigId: "github.com", token: "t" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: "bad credentials" });
    expect(addMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the identity has no login", async () => {
    getProviderConfigMock.mockResolvedValue(GH_CONFIG);
    getProviderMock.mockResolvedValue(providerWithIdentity({ login: "" }));
    const res = await postJson(
      "/api/accounts/add-token",
      JSON.stringify({ providerConfigId: "github.com", token: "t" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "provider did not return a login" });
    expect(addMock).not.toHaveBeenCalled();
  });

  it("constructs a gh_-prefixed id with a sanitized login and a default label", async () => {
    getProviderConfigMock.mockResolvedValue(GH_CONFIG);
    getProviderMock.mockResolvedValue(providerWithIdentity({ login: "Octo.Cat", scope: "repo" }));
    const res = await postJson(
      "/api/accounts/add-token",
      JSON.stringify({ providerConfigId: "github.com", token: "tok" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, accountId: "gh_Octo_Cat_github.com" });
    expect(addMock).toHaveBeenCalledTimes(1);
    expect(addMock.mock.calls[0]?.[0]).toMatchObject({
      id: "gh_Octo_Cat_github.com",
      providerKind: "github",
      providerConfigId: "github.com",
      label: "Octo.Cat (github.com)", // login (host), host derived from webUrl
      login: "Octo.Cat",
      accessToken: "tok",
      scope: "repo",
      source: "token",
    });
  });

  it("uses the fj_ prefix for forgejo configs", async () => {
    getProviderConfigMock.mockResolvedValue(FJ_CONFIG);
    getProviderMock.mockResolvedValue(providerWithIdentity({ login: "user" }));
    const res = await postJson(
      "/api/accounts/add-token",
      JSON.stringify({ providerConfigId: "codeberg.org", token: "tok" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, accountId: "fj_user_codeberg.org" });
    expect(addMock.mock.calls[0]?.[0]).toMatchObject({
      label: "user (codeberg.org)",
      scope: "", // identity.scope absent → defaults to ""
    });
  });

  it("honours an explicit label override", async () => {
    getProviderConfigMock.mockResolvedValue(GH_CONFIG);
    getProviderMock.mockResolvedValue(providerWithIdentity({ login: "octo" }));
    await postJson(
      "/api/accounts/add-token",
      JSON.stringify({ providerConfigId: "github.com", token: "t", label: "  Work  " }),
    );
    expect(addMock.mock.calls[0]?.[0]).toMatchObject({ label: "Work" });
  });
});

describe("DELETE /api/accounts", () => {
  it("returns 400 when id is missing", async () => {
    const res = await app.request("/api/accounts", { method: "DELETE" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "missing id" });
    expect(removeMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the account does not exist", async () => {
    removeMock.mockResolvedValue(false);
    const res = await app.request("/api/accounts?id=gh_x", { method: "DELETE" });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "account not found" });
  });

  it("returns 200 on a successful delete", async () => {
    removeMock.mockResolvedValue(true);
    const res = await app.request("/api/accounts?id=gh_x", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(removeMock).toHaveBeenCalledWith("gh_x");
  });
});

describe("POST /api/accounts/activate", () => {
  it("returns 400 on invalid JSON", async () => {
    const res = await postJson("/api/accounts/activate", "{");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid JSON" });
  });

  it("returns 400 when id is missing", async () => {
    const res = await postJson("/api/accounts/activate", JSON.stringify({}));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "missing id" });
  });

  it("returns 404 when the account is not found", async () => {
    setActiveMock.mockResolvedValue(null);
    const res = await postJson("/api/accounts/activate", JSON.stringify({ id: "gh_x" }));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "account not found" });
  });

  it("returns 200 with the activated id on success", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: route only reads `.id`.
    setActiveMock.mockResolvedValue({ id: "gh_x" } as any);
    const res = await postJson("/api/accounts/activate", JSON.stringify({ id: "gh_x" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, activeId: "gh_x" });
    expect(setActiveMock).toHaveBeenCalledWith("gh_x");
  });
});
