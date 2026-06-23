import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { HttpBindings } from "@hono/node-server";
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { errorMessage } from "../../utils/errors";
import { getLocalReposCached, invalidateLocalReposCache } from "../localReposData";
import { getConfig, updateConfig } from "../localReposStore";
import { logger } from "../logger";
import { errEnvelope, okEnvelope } from "../openapi/envelope";
import { cacheableJson, json } from "../openapi/respond";

type App = OpenAPIHono<{ Bindings: HttpBindings }>;

const execFileAsync = promisify(execFile);

const freshQuery = z.object({ fresh: z.string().optional() });
const errContent = { content: { "application/json": { schema: errEnvelope } } };

/** macOS `open` invocation per target. `open <path>` opens the folder in Finder;
 * `open -a Cursor <path>` launches Cursor at the repo. execFile (no shell) so the
 * path is always a single literal argument — never interpolated into a command. */
const OPEN_ARGS: Record<"finder" | "cursor", (path: string) => string[]> = {
  finder: (path) => [path],
  cursor: (path) => ["-a", "Cursor", path],
};

const OpenBody = z
  .object({ path: z.string(), target: z.enum(["finder", "cursor"]) })
  .openapi("LocalRepoOpenBody");

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

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/local-repos/open",
      tags: ["local"],
      request: {
        body: { content: { "application/json": { schema: OpenBody } } },
      },
      responses: {
        200: {
          content: { "application/json": { schema: okEnvelope({}) } },
          description: "Opened the repo location",
        },
        400: { ...errContent, description: "Invalid request" },
        403: { ...errContent, description: "Path is not a scanned repo" },
        500: { ...errContent, description: "Open command failed" },
      },
    }),
    async (c) => {
      const { path, target } = c.req.valid("json");
      // Only ever open a path that's in the scanned-repo list — the exact-match
      // check is the security boundary against opening arbitrary filesystem paths.
      const scan = await getLocalReposCached(false);
      if (!scan.ok) return c.json({ ok: false as const, error: scan.error }, 500);
      if (!scan.repos.some((r) => r.path === path)) {
        return c.json({ ok: false as const, error: "Path is not a scanned repository" }, 403);
      }
      try {
        await execFileAsync("open", OPEN_ARGS[target](path), { timeout: 5000 });
        logger.info({ path, target }, "opened local repo location");
        return c.json({ ok: true as const }, 200);
      } catch (err) {
        logger.error({ err, path, target }, "failed to open local repo location");
        return c.json({ ok: false as const, error: errorMessage(err) }, 500);
      }
    },
  );
}
