import { serve } from "@hono/node-server";
import { app } from "./server/app";
import { getAuthMode } from "./server/authProvider";
import { HOST, PORT } from "./server/config";
import { logger } from "./server/logger";

serve({ fetch: app.fetch, port: PORT, hostname: HOST }, () => {
  logger.info(
    { url: `http://${HOST}:${PORT}`, authMode: getAuthMode() },
    "gitdeck server listening",
  );
});
