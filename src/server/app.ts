import type { HttpBindings } from "@hono/node-server";
import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono } from "@hono/zod-openapi";
import { requestId } from "hono/request-id";
import { APP_VERSION } from "../version";
import { logger } from "./logger";
import { registerAccounts } from "./routes/accounts";
import { registerAuth } from "./routes/auth";
import { registerDashboard } from "./routes/dashboard";
import { registerDelegated } from "./routes/delegated";
import { registerInsightsGraph } from "./routes/insightsGraph";
import { registerMentions } from "./routes/mentions";
import { registerNotifications } from "./routes/notifications";
import { registerProjects } from "./routes/projects";
import { registerRepoAliases } from "./routes/repoAliases";
import { registerStatic } from "./routes/static";

/**
 * The Hono application. Every endpoint, static asset, and SPA route is served
 * here — there is no `node:http` fallback. Routes come in three layers:
 *   1. Typed, OpenAPI-documented data routes (`app.openapi`) with zod validation.
 *   2. Plain Hono auth/account routes (dynamic OAuth payloads kept out of the
 *      spec — see TODO.md "API surface compromises").
 *   3. A static-asset + SPA catch-all, registered last.
 */
export const app = new OpenAPIHono<{ Bindings: HttpBindings }>({
  // Reformat zod validation failures into the `{ ok, error }` envelope the
  // client expects (Hono's default 400 body would not match the contract).
  defaultHook: (result, c) => {
    if (!result.success) {
      const message =
        result.error.issues
          .map((issue) => {
            const path = issue.path.join(".");
            return path ? `${path}: ${issue.message}` : issue.message;
          })
          .join("; ") || "invalid request";
      return c.json({ ok: false, error: message }, 400);
    }
    return undefined;
  },
});

// Log full error (stack + cause via pino) with correlation id, then 500.
app.onError((err, c) => {
  logger.error({ err, reqId: c.get("requestId"), path: c.req.path }, "unhandled error");
  return c.json({ ok: false, error: "internal error", reqId: c.get("requestId") }, 500);
});

// Assign a correlation id to every request, then log method/path/status/duration.
app.use("*", requestId());
app.use("*", async (c, next) => {
  const start = performance.now();
  await next();
  logger.info(
    {
      reqId: c.get("requestId"),
      method: c.req.method,
      path: c.req.path,
      status: c.res?.status,
      ms: Math.round(performance.now() - start),
    },
    "request",
  );
});

// ── Typed, OpenAPI-documented data routes ────────────────────────────────────
registerInsightsGraph(app);
registerRepoAliases(app);
registerMentions(app);
registerProjects(app);
registerDashboard(app);
registerNotifications(app);
registerDelegated(app);

// ── Plain Hono auth/account routes (dynamic payloads, not in the spec) ────────
registerAuth(app);
registerAccounts(app);

// ── OpenAPI spec + Swagger UI (dev only; keeps the shipped image lean) ───────
if (process.env.NODE_ENV !== "production") {
  app.doc("/doc", {
    openapi: "3.1.0",
    info: { title: "gitdeck API", version: APP_VERSION },
  });
  app.get("/swagger", swaggerUI({ url: "/doc" }));
}

// ── Static assets + SPA index fallback (must be registered last) ─────────────
registerStatic(app);
