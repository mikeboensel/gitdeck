import { z } from "@hono/zod-openapi";

/** Shared request-schema building blocks for API route clusters. */

/** A repository identifier query field (`owner/repo`). Format is re-checked in handlers. */
export const repoField = z.string().openapi({ example: "octocat/Hello-World" });

/** GraphQL-style pagination info returned to the client. */
export const pageInfo = z.object({
  endCursor: z.string().nullable(),
  hasNextPage: z.boolean(),
});

/**
 * Optional query enum mirroring the legacy leniency: a missing value falls back
 * to `fallback`, and the value is upper-cased before the enum check (so `asc`
 * and `ASC` both pass). Invalid values fail validation → 400 envelope.
 */
export function upperEnum<const T extends [string, ...string[]]>(values: T, fallback: T[number]) {
  return z
    .string()
    .optional()
    .transform((value) => (value ?? fallback).toUpperCase())
    .pipe(z.enum(values));
}
