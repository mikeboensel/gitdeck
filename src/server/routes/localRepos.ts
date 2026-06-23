import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type { HttpBindings } from "@hono/node-server";
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { errorMessage } from "../../utils/errors";
import { isWithinHome, listChildDirs, resolveCloneCommand } from "../localClone";
import { getLocalReposCached, invalidateLocalReposCache } from "../localReposData";
import { getConfig, getScanRoots, updateConfig } from "../localReposStore";
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

const BrowseQuery = z.object({ path: z.string().optional() });
const BrowseResponse = okEnvelope({
  path: z.string(),
  parent: z.string().nullable(),
  entries: z.array(z.object({ name: z.string(), path: z.string() })),
}).openapi("LocalReposBrowseResponse");

const CloneBody = z
  .object({ nameWithOwner: z.string(), url: z.string(), destDir: z.string() })
  .openapi("LocalRepoCloneBody");
const CloneResponse = okEnvelope({ path: z.string() }).openapi("LocalRepoCloneResponse");

/** True when `dir` would already be reached by scanning one of `roots` (it is a
 * root or nested under one), so cloning there needs no scan-root change. */
function coveredByRoots(dir: string, roots: string[]): boolean {
  const target = resolve(dir);
  return roots.some((r) => {
    const root = resolve(r);
    return target === root || target.startsWith(root + sep);
  });
}

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

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/local-repos/browse",
      tags: ["local"],
      request: { query: BrowseQuery },
      responses: {
        200: {
          content: { "application/json": { schema: BrowseResponse } },
          description: "Child directories of a path (for the clone picker)",
        },
        403: { ...errContent, description: "Path is outside the home directory" },
        500: { ...errContent, description: "Could not read the directory" },
      },
    }),
    async (c) => {
      // Default to home and confine browsing to the home subtree — the isWithinHome
      // check is the boundary against listing arbitrary filesystem locations.
      const requested = c.req.valid("query").path ?? homedir();
      const path = resolve(requested);
      if (!isWithinHome(path)) {
        return c.json({ ok: false as const, error: "Path is outside the home directory" }, 403);
      }
      try {
        const entries = await listChildDirs(path);
        const parent =
          isWithinHome(resolve(path, "..")) && path !== resolve(homedir())
            ? resolve(path, "..")
            : null;
        return c.json({ ok: true as const, path, parent, entries }, 200);
      } catch (err) {
        return c.json({ ok: false as const, error: errorMessage(err) }, 500);
      }
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/local-repos/clone",
      tags: ["local"],
      request: {
        body: { content: { "application/json": { schema: CloneBody } } },
      },
      responses: {
        200: {
          content: { "application/json": { schema: CloneResponse } },
          description: "Cloned the repository",
        },
        403: { ...errContent, description: "Destination is outside the home directory" },
        409: { ...errContent, description: "Destination already exists" },
        500: { ...errContent, description: "Clone failed" },
      },
    }),
    async (c) => {
      const { nameWithOwner, url, destDir } = c.req.valid("json");
      const dest = resolve(destDir);
      if (!isWithinHome(dest)) {
        return c.json(
          { ok: false as const, error: "Destination is outside the home directory" },
          403,
        );
      }
      const repoName = basename(nameWithOwner);
      const target = join(dest, repoName);
      // Refuse to clone onto a non-empty directory (git would error anyway — this is
      // a cleaner message and avoids spawning a doomed subprocess).
      try {
        if ((await readdir(target)).length > 0) {
          return c.json({ ok: false as const, error: `${target} already exists` }, 409);
        }
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
          return c.json({ ok: false as const, error: errorMessage(err) }, 500);
        }
      }
      const { cmd, args } = resolveCloneCommand({ nameWithOwner, url }, target);
      try {
        await execFileAsync(cmd, args, { timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
      } catch (err) {
        logger.error({ err, nameWithOwner, target }, "clone failed");
        return c.json({ ok: false as const, error: errorMessage(err) }, 500);
      }
      // Make the new clone discoverable: if no existing scan root already covers the
      // destination, add it and rescan so it surfaces in the Local Repos view.
      if (!coveredByRoots(dest, await getScanRoots())) {
        const config = await getConfig();
        await updateConfig({ scanRoots: [...config.scanRoots, dest] });
      }
      invalidateLocalReposCache();
      logger.info({ nameWithOwner, target }, "cloned repository");
      return c.json({ ok: true as const, path: target }, 200);
    },
  );
}
