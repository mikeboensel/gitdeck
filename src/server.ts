import { serve } from "@hono/node-server";
import { app, injectWebSocket } from "./server/app";
import { getAuthMode } from "./server/authProvider";
import { HOST, PORT } from "./server/config";
import { logger } from "./server/logger";

const server = serve({ fetch: app.fetch, port: PORT, hostname: HOST }, () => {
  logger.info(
    { url: `http://${HOST}:${PORT}`, authMode: getAuthMode() },
    "gitdeck server listening",
  );
});

// Enable WebSocket upgrades (the terminal route) on the running HTTP server.
injectWebSocket(server);
