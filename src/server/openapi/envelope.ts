import { z } from "@hono/zod-openapi";

/**
 * Shared response-envelope schemas. Every API response follows the
 * `{ ok: boolean, ... }` convention the client (`src/api/github.ts`) depends on:
 * it treats `json.ok === false` as an error and `needsAuth` as an auth failure.
 */

export const errEnvelope = z
  .object({
    ok: z.literal(false),
    error: z.string(),
    needsAuth: z.boolean().optional(),
  })
  .openapi("ErrorResponse");

export type ErrEnvelope = z.infer<typeof errEnvelope>;

/** Build an `{ ok: true, ...shape }` success schema. */
export function okEnvelope<T extends z.ZodRawShape>(shape: T) {
  return z.object({ ok: z.literal(true), ...shape });
}

/** Success-or-error union for a route's 200 response schema. */
export function apiResponse<T extends z.ZodRawShape>(shape: T) {
  return z.union([okEnvelope(shape), errEnvelope]);
}
