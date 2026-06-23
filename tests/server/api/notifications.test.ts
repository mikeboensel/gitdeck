// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/server/notifications", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/server/notifications")>()),
  getNotificationsCached: vi.fn(),
  markThreadRead: vi.fn(),
  markAllRead: vi.fn(),
}));

import { app } from "../../../src/server/app";
import {
  getNotificationsCached,
  markAllRead,
  markThreadRead,
} from "../../../src/server/notifications";

const listMock = vi.mocked(getNotificationsCached);
const readMock = vi.mocked(markThreadRead);
const readAllMock = vi.mocked(markAllRead);

type NotificationsResult = Awaited<ReturnType<typeof getNotificationsCached>>;

const mkData = (notifications: { reason: string; unread: boolean }[]): NotificationsResult =>
  ({
    ok: true,
    data: { ok: true, notifications, fetchedAt: "2020-01-01", pollInterval: 60 },
  }) as unknown as NotificationsResult;

beforeEach(() => {
  listMock.mockReset();
  readMock.mockReset();
  readAllMock.mockReset();
});

describe("GET /api/notifications", () => {
  it("returns 200 with an ETag", async () => {
    listMock.mockResolvedValue(mkData([{ reason: "mention", unread: true }]));
    const res = await app.request("/api/notifications");
    expect(res.status).toBe(200);
    expect(res.headers.get("ETag")).toMatch(/^W\//);
    expect((await res.json()).notifications).toHaveLength(1);
  });

  it("filters by participating reason", async () => {
    listMock.mockResolvedValue(
      mkData([
        { reason: "mention", unread: true },
        { reason: "subscribed", unread: true },
      ]),
    );
    const res = await app.request("/api/notifications?participating=1");
    const body = await res.json();
    expect(body.notifications).toHaveLength(1);
    expect(body.notifications[0].reason).toBe("mention");
  });

  it("maps needsAuth to 401", async () => {
    listMock.mockResolvedValue({ ok: false, error: "auth", needsAuth: true });
    const res = await app.request("/api/notifications");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, needsAuth: true });
  });
});

describe("POST /api/notifications/read", () => {
  it("marks a thread read", async () => {
    readMock.mockResolvedValue({ ok: true, status: 205 });
    const res = await app.request("/api/notifications/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ threadId: "123" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(readMock).toHaveBeenCalledWith("123");
  });

  it("rejects a non-numeric threadId", async () => {
    const res = await app.request("/api/notifications/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ threadId: "abc" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: "missing or invalid threadId" });
    expect(readMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/notifications/read-all", () => {
  it("marks all read (empty body)", async () => {
    readAllMock.mockResolvedValue({ ok: true, status: 205 });
    const res = await app.request("/api/notifications/read-all", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    expect(readAllMock).toHaveBeenCalledWith({ repo: null, lastReadAt: null });
  });

  it("rejects an invalid lastReadAt", async () => {
    const res = await app.request("/api/notifications/read-all", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lastReadAt: "not-a-date" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: "invalid lastReadAt" });
  });

  it("rejects an invalid repo", async () => {
    const res = await app.request("/api/notifications/read-all", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repo: "nope" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: "invalid repo" });
  });
});
