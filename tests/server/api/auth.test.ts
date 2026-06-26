// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/server/authProvider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/server/authProvider")>()),
  getAuthMode: vi.fn(),
}));

vi.mock("../../../src/server/oauth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/server/oauth")>()),
  authStatus: vi.fn(),
  isClientIdConfigured: vi.fn(),
  logout: vi.fn(),
  startDeviceFlow: vi.fn(),
  pollDeviceFlow: vi.fn(),
}));

vi.mock("../../../src/server/dashboardData", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/server/dashboardData")>()),
  invalidateDataCache: vi.fn(),
}));

import { app } from "../../../src/server/app";
import { getAuthMode } from "../../../src/server/authProvider";
import { invalidateDataCache } from "../../../src/server/dashboardData";
import {
  isClientIdConfigured,
  logout,
  pollDeviceFlow,
  startDeviceFlow,
} from "../../../src/server/oauth";

const modeMock = vi.mocked(getAuthMode);
const clientIdMock = vi.mocked(isClientIdConfigured);
const logoutMock = vi.mocked(logout);
const startMock = vi.mocked(startDeviceFlow);
const pollMock = vi.mocked(pollDeviceFlow);
const invalidateMock = vi.mocked(invalidateDataCache);

function post(path: string) {
  return app.request(path, { method: "POST" });
}

beforeEach(() => {
  modeMock.mockReset();
  clientIdMock.mockReset();
  logoutMock.mockReset();
  startMock.mockReset();
  pollMock.mockReset();
  invalidateMock.mockReset();
  modeMock.mockReturnValue("device");
  clientIdMock.mockReturnValue(true);
});

describe("auth-mode gate (device endpoints disabled outside device mode)", () => {
  for (const mode of ["gh-cli", "token"] as const) {
    it(`POST /api/auth/start returns 400 in '${mode}' mode`, async () => {
      modeMock.mockReturnValue(mode);
      const res = await post("/api/auth/start");
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ ok: false });
      expect(startMock).not.toHaveBeenCalled();
    });

    it(`POST /api/auth/poll returns 400 in '${mode}' mode`, async () => {
      modeMock.mockReturnValue(mode);
      const res = await post("/api/auth/poll");
      expect(res.status).toBe(400);
      expect(pollMock).not.toHaveBeenCalled();
    });

    it(`POST /api/auth/logout returns 400 in '${mode}' mode`, async () => {
      modeMock.mockReturnValue(mode);
      const res = await post("/api/auth/logout");
      expect(res.status).toBe(400);
      expect(logoutMock).not.toHaveBeenCalled();
    });
  }
});

describe("POST /api/auth/start", () => {
  it("returns 400 when the client id is not configured", async () => {
    clientIdMock.mockReturnValue(false);
    const res = await post("/api/auth/start");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("GITHUB_CLIENT_ID") });
    expect(startMock).not.toHaveBeenCalled();
  });

  it("returns 200 with the flow payload on success", async () => {
    startMock.mockResolvedValue({
      userCode: "ABCD-1234",
      verificationUri: "https://github.com/login/device",
      expiresIn: 900,
      interval: 5,
    });
    const res = await post("/api/auth/start");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, userCode: "ABCD-1234" });
  });

  it("maps a thrown error to 500", async () => {
    startMock.mockRejectedValue(new Error("device code request failed"));
    const res = await post("/api/auth/start");
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false, error: "device code request failed" });
  });
});

describe("POST /api/auth/poll", () => {
  it("invalidates the data cache when status is 'ok'", async () => {
    pollMock.mockResolvedValue({ status: "ok", login: "octo" });
    const res = await post("/api/auth/poll");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, status: "ok", login: "octo" });
    expect(invalidateMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT invalidate the data cache for a non-ok status", async () => {
    pollMock.mockResolvedValue({ status: "pending" });
    const res = await post("/api/auth/poll");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "pending" });
    expect(invalidateMock).not.toHaveBeenCalled();
  });

  it("maps a thrown error to 500", async () => {
    pollMock.mockRejectedValue(new Error("poll failed"));
    const res = await post("/api/auth/poll");
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false, error: "poll failed" });
    expect(invalidateMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/logout", () => {
  it("logs out and returns 200 in device mode", async () => {
    logoutMock.mockResolvedValue(undefined);
    const res = await post("/api/auth/logout");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(logoutMock).toHaveBeenCalledTimes(1);
  });
});
