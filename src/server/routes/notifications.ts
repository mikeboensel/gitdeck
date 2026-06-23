import type { HttpBindings } from "@hono/node-server";
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { parseRepositoryName } from "../../utils/repository";
import { getNotificationsCached, markAllRead, markThreadRead } from "../notifications";
import { errEnvelope, okEnvelope } from "../openapi/envelope";
import { cacheableJson } from "../openapi/respond";

type App = OpenAPIHono<{ Bindings: HttpBindings }>;

const errContent = { content: { "application/json": { schema: errEnvelope } } };
const okContent = { content: { "application/json": { schema: okEnvelope({}) } } };

const PARTICIPATING_REASONS = new Set([
  "assign",
  "author",
  "comment",
  "manual",
  "mention",
  "review_requested",
  "team_mention",
]);

const ListResponse = okEnvelope({
  notifications: z.array(z.unknown()),
  fetchedAt: z.string(),
  pollInterval: z.number(),
}).openapi("NotificationsResponse");

const listRoute = createRoute({
  method: "get",
  path: "/api/notifications",
  tags: ["notifications"],
  request: {
    query: z.object({
      fresh: z.string().optional(),
      participating: z.string().optional(),
      unread: z.string().optional(),
      reason: z.string().optional(),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: ListResponse } },
      description: "Notifications",
    },
    304: { description: "Not modified (ETag match)" },
    401: { ...errContent, description: "Authentication required" },
    500: { ...errContent, description: "Upstream error" },
  },
});

const readRoute = createRoute({
  method: "post",
  path: "/api/notifications/read",
  tags: ["notifications"],
  request: {
    body: {
      content: { "application/json": { schema: z.object({ threadId: z.string().optional() }) } },
    },
  },
  responses: {
    200: { ...okContent, description: "Marked read" },
    400: { ...errContent, description: "Invalid request" },
    401: { ...errContent, description: "Authentication required" },
    500: { ...errContent, description: "Upstream error" },
  },
});

const readAllRoute = createRoute({
  method: "post",
  path: "/api/notifications/read-all",
  tags: ["notifications"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({ repo: z.string().optional(), lastReadAt: z.string().optional() }),
        },
      },
    },
  },
  responses: {
    200: { ...okContent, description: "Marked all read" },
    400: { ...errContent, description: "Invalid request" },
    401: { ...errContent, description: "Authentication required" },
    500: { ...errContent, description: "Upstream error" },
  },
});

export function registerNotifications(app: App): void {
  app.openapi(listRoute, async (c) => {
    const { fresh, participating, unread, reason } = c.req.valid("query");
    const result = await getNotificationsCached(fresh === "1");
    if (!result.ok) {
      const status = result.needsAuth ? 401 : 500;
      return c.json(
        { ok: false as const, error: result.error ?? "", needsAuth: result.needsAuth },
        status,
      );
    }
    let notifications = result.data.notifications;
    if (participating === "1") {
      notifications = notifications.filter((entry) => PARTICIPATING_REASONS.has(entry.reason));
    }
    if (unread === "1") notifications = notifications.filter((entry) => entry.unread);
    const reasonFilter = (reason || "").trim();
    if (reasonFilter) {
      const allowed = new Set(
        reasonFilter
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      );
      if (allowed.size) notifications = notifications.filter((entry) => allowed.has(entry.reason));
    }
    return cacheableJson(c, {
      ok: true,
      notifications,
      fetchedAt: result.data.fetchedAt,
      pollInterval: result.data.pollInterval,
    });
  });

  app.openapi(readRoute, async (c) => {
    const threadId = (c.req.valid("json").threadId || "").trim();
    if (!threadId || !/^\d+$/.test(threadId)) {
      return c.json({ ok: false as const, error: "missing or invalid threadId" }, 400);
    }
    const result = await markThreadRead(threadId);
    if (!result.ok) {
      const status: 401 | 500 = result.needsAuth ? 401 : 500;
      return c.json(
        { ok: false as const, error: result.error ?? "", needsAuth: result.needsAuth },
        status,
      );
    }
    return c.json({ ok: true as const }, 200);
  });

  app.openapi(readAllRoute, async (c) => {
    const body = c.req.valid("json");
    const repo = (body.repo || "").trim() || null;
    if (repo && !parseRepositoryName(repo)) {
      return c.json({ ok: false as const, error: "invalid repo" }, 400);
    }
    const lastReadAt = body.lastReadAt ? String(body.lastReadAt) : null;
    if (lastReadAt && Number.isNaN(Date.parse(lastReadAt))) {
      return c.json({ ok: false as const, error: "invalid lastReadAt" }, 400);
    }
    const result = await markAllRead({ repo, lastReadAt });
    if (!result.ok) {
      const status: 401 | 500 = result.needsAuth ? 401 : 500;
      return c.json(
        { ok: false as const, error: result.error ?? "", needsAuth: result.needsAuth },
        status,
      );
    }
    return c.json({ ok: true as const }, 200);
  });
}
