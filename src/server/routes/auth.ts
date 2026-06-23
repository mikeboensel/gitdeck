import type { HttpBindings } from "@hono/node-server";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { getAuthMode } from "../authProvider";
import { invalidateCIHealthCache } from "../ciHealth";
import { invalidateDataCache } from "../dashboardData";
import { invalidateNotificationsCache } from "../notifications";
import {
  authStatus,
  isClientIdConfigured,
  logout,
  pollDeviceFlow,
  startDeviceFlow,
} from "../oauth";
import { json } from "../openapi/respond";
import { errorMessage } from "../../utils/errors";

type App = OpenAPIHono<{ Bindings: HttpBindings }>;

/**
 * Auth / device-flow OAuth endpoints. Kept as plain (untyped) Hono routes
 * rather than typed-OpenAPI ones: the dynamic OAuth payloads (`authStatus()`
 * spreads provider status, `DeviceFlowPollResult` has an optional `error`)
 * fight the zod-response schema system for little validation benefit, so they
 * stay out of the spec by design. Behavior is identical to the original
 * `node:http` handlers.
 */
export function registerAuth(app: App): void {
  app.get("/api/auth/status", async (c) => {
    const status = await authStatus();
    return json(c, 200, { ok: true, ...status, clientIdConfigured: isClientIdConfigured() });
  });

  app.post("/api/auth/start", async (c) => {
    if (getAuthMode() !== "device") {
      return json(c, 400, {
        ok: false,
        error: `Device flow is disabled in '${getAuthMode()}' auth mode.`,
      });
    }
    if (!isClientIdConfigured()) {
      return json(c, 400, {
        ok: false,
        error: "GITHUB_CLIENT_ID is not set. See README to register an OAuth App.",
      });
    }
    try {
      const flow = await startDeviceFlow();
      return json(c, 200, { ok: true, ...flow });
    } catch (error) {
      return json(c, 500, { ok: false, error: errorMessage(error) });
    }
  });

  app.post("/api/auth/poll", async (c) => {
    if (getAuthMode() !== "device") {
      return json(c, 400, {
        ok: false,
        error: `Device flow is disabled in '${getAuthMode()}' auth mode.`,
      });
    }
    try {
      const result = await pollDeviceFlow();
      if (result.status === "ok") invalidateDataCache();
      return json(c, 200, { ok: true, ...result });
    } catch (error) {
      return json(c, 500, { ok: false, error: errorMessage(error) });
    }
  });

  app.post("/api/auth/logout", async (c) => {
    if (getAuthMode() !== "device") {
      return json(c, 400, {
        ok: false,
        error: `Logout is not available in '${getAuthMode()}' auth mode. Sign out via your gh CLI or unset the env token.`,
      });
    }
    await logout();
    invalidateDataCache();
    invalidateNotificationsCache();
    invalidateCIHealthCache();
    return json(c, 200, { ok: true });
  });
}
