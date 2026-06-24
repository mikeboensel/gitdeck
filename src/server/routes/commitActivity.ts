import type { HttpBindings } from "@hono/node-server";
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { getCommitActivityCached } from "../commitActivity";
import { errEnvelope, okEnvelope } from "../openapi/envelope";
import { cacheableJson } from "../openapi/respond";

type App = OpenAPIHono<{ Bindings: HttpBindings }>;

const errContent = { content: { "application/json": { schema: errEnvelope } } };

const CommitActivityResponse = okEnvelope({
  days: z.array(z.object({ repo: z.string(), date: z.string(), count: z.number() })),
  repos: z.array(z.string()),
  generatedAt: z.string(),
}).openapi("CommitActivityResponse");

const route = createRoute({
  method: "get",
  path: "/api/commit-activity",
  tags: ["dashboard"],
  request: { query: z.object({ fresh: z.string().optional() }) },
  responses: {
    200: {
      content: { "application/json": { schema: CommitActivityResponse } },
      description: "Per-repo, per-day commit counts for the authenticated user (last 12 months)",
    },
    304: { description: "Not modified (ETag match)" },
    401: { ...errContent, description: "Authentication required" },
    500: { ...errContent, description: "Upstream error" },
  },
});

export function registerCommitActivity(app: App): void {
  app.openapi(route, async (c) => {
    const fresh = c.req.valid("query").fresh === "1";
    return cacheableJson(c, await getCommitActivityCached(fresh));
  });
}
