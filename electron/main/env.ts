import { app } from "electron";

// MUST be imported before the Hono server module (which constructs the pino
// logger at eval time). A packaged build runs with NODE_ENV unset, so gitdeck's
// logger would load the `pino-pretty` transport — a devDependency, and a
// worker-thread transport that doesn't survive bundling into app.asar — and the
// main process crashes on launch. Forcing production here makes the packaged app
// behave like prod: plain JSON logging (no worker), no Swagger UI.
if (app.isPackaged && !process.env.NODE_ENV) {
  process.env.NODE_ENV = "production";
}
