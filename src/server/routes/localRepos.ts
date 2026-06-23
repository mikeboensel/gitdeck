import type { HttpBindings } from "@hono/node-server";
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { getLocalReposCached, invalidateLocalReposCache } from "../localReposData";
import { getConfig, updateConfig } from "../localReposStore";
import { errEnvelope, okEnvelope } from "../openapi/envelope";
import { cacheableJson, json } from "../openapi/respond";

type App = OpenAPIHono<{ Bindings: HttpBindings }>;

const freshQuery = z.object({ fresh: z.string().optional() });
const errContent = { content: { "application/json": { schema: errEnvelope } } };

const LocalReposResponse = okEnvelope({
  repos: z.array(z.unknown()),
  scannedAt: z.string(),
}).openapi("LocalReposResponse");

const configShape = {
  scanRoots: z.array(z.string()),
  excludes: z.array(z.string()),
  denylist: z.array(z.string()),
};
const LocalReposConfigResponse = okEnvelope({ config: z.object(configShape) }).openapi(
  "LocalReposConfigResponse",
);
const LocalReposConfigBody = z
  .object({
    scanRoots: z.array(z.string()).optional(),
    excludes: z.array(z.string()).optional(),
    denylist: z.array(z.string()).optional(),
  })
  .openapi("LocalReposConfigBody");

export function registerLocalRepos(app: App): void {
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/local-repos",
      tags: ["local"],
      request: { query: freshQuery },
      responses: {
        200: {
          content: { "application/json": { schema: LocalReposResponse } },
          description: "Local repositories",
        },
        304: { description: "Not modified (ETag match)" },
        500: { ...errContent, description: "Scan error" },
      },
    }),
    async (c) => {
      const fresh = c.req.valid("query").fresh === "1";
      return cacheableJson(c, await getLocalReposCached(fresh));
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/local-repos/config",
      tags: ["local"],
      responses: {
        200: {
          content: { "application/json": { schema: LocalReposConfigResponse } },
          description: "Scan configuration",
        },
        304: { description: "Not modified (ETag match)" },
      },
    }),
    async (c) => json(c, 200, { ok: true, config: await getConfig() }),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/local-repos/config",
      tags: ["local"],
      request: {
        body: { content: { "application/json": { schema: LocalReposConfigBody } } },
      },
      responses: {
        200: {
          content: { "application/json": { schema: LocalReposConfigResponse } },
          description: "Updated scan configuration",
        },
        304: { description: "Not modified (ETag match)" },
        400: { ...errContent, description: "Invalid request" },
      },
    }),
    async (c) => {
      const config = await updateConfig(c.req.valid("json"));
      invalidateLocalReposCache(); // roots/excludes/denylist changed — next load rescans
      return json(c, 200, { ok: true, config });
    },
  );
}
