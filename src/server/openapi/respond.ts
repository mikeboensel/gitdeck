import { createHash } from "node:crypto";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { AuthRequiredError } from "../githubClient";

/** The discriminated-union shape every cached/data handler returns. */
export interface Envelope {
  ok: boolean;
  needsAuth?: boolean;
  [key: string]: unknown;
}

/** Map the `{ ok, needsAuth }` convention to a status code (ok→200, auth→401, else→500). */
export function statusFor(payload: Envelope): 200 | 401 | 500 {
  return payload.ok ? 200 : payload.needsAuth ? 401 : 500;
}

/** True when a thrown error is the GitHub-client auth sentinel. */
export function isAuthError(error: unknown): boolean {
  return error instanceof AuthRequiredError || (error as Error)?.name === "AuthRequiredError";
}

/**
 * JSON response with weak-ETag caching, byte-identical to the legacy
 * `sendJsonCacheable` (`src/server/http.ts`): only 200s are cached; the ETag is
 * `W/"<sha1-base64url(JSON.stringify(body))>"`; a matching `If-None-Match`
 * yields a 304. Implemented in pure Hono (returns a real `Response`) so it
 * composes with `app.openapi` typed routes. The client's stale-while-revalidate
 * (`src/api/cache.ts`) depends on this ETag staying identical.
 */
export function cacheableJson(c: Context, payload: Envelope): Response {
  const status = statusFor(payload);
  if (status !== 200) {
    return c.json(payload, status);
  }
  const body = JSON.stringify(payload);
  const etag = `W/"${createHash("sha1").update(body).digest("base64url")}"`;
  if (c.req.header("if-none-match") === etag) {
    c.header("ETag", etag);
    c.header("Cache-Control", "no-store");
    return c.body(null, 304);
  }
  c.header("Content-Type", "application/json; charset=utf-8");
  c.header("Cache-Control", "no-store");
  c.header("ETag", etag);
  return c.body(body, 200);
}

/** Plain JSON response (no caching), mirroring legacy `sendJson` semantics. */
export function json(c: Context, status: ContentfulStatusCode, payload: unknown): Response {
  c.header("Cache-Control", "no-store");
  return c.json(payload as object, status);
}
