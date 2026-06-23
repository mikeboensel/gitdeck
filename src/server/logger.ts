import { pino } from "pino";

/** Shared structured logger. Pretty in dev (tsx), JSON in prod (bundled). */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } }
      : undefined,
  redact: ["req.headers.authorization", "*.accessToken", "*.token", "*.access_token"],
});
