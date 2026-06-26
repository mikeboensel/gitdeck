import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type { HttpBindings } from "@hono/node-server";
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { errorMessage } from "../../utils/errors";
import { arrangeLocalRepos, assessSafety } from "../../utils/localRepos";
import { isWithinHome, listChildDirs, resolveCloneCommand } from "../localClone";
import { refreshSizes } from "../localRepoSizes";
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
 * `open -a Cursor <path>` launches Cursor at the repo; `open -a Terminal <path>`
 * opens a Terminal window with its working directory set to the repo. execFile
 * (no shell) so the path is always a single literal argument — never
 * interpolated into a command. */
const OPEN_ARGS: Record<"finder" | "cursor" | "terminal", (path: string) => string[]> = {
  finder: (path) => [path],
  cursor: (path) => ["-a", "Cursor", path],
  terminal: (path) => ["-a", "Terminal", path],
};

const OpenBody = z
  .object({ path: z.string(), target: z.enum(["finder", "cursor", "terminal"]) })
  .openapi("LocalRepoOpenBody");

const LocalReposResponse = okEnvelope({
  repos: z.array(z.unknown()),
  scannedAt: z.string(),
}).openapi("LocalReposResponse");

const configShape = {
  scanRoots: z.array(z.string()),
  excludes: z.array(z.string()),
  denylist: z.array(z.string()),
  sizeCacheTtlMinutes: z.number(),
};
const LocalReposConfigResponse = okEnvelope({ config: z.object(configShape) }).openapi(
  "LocalReposConfigResponse",
);
const LocalReposConfigBody = z
  .object({
    scanRoots: z.array(z.string()).optional(),
    excludes: z.array(z.string()).optional(),
    denylist: z.array(z.string()).optional(),
    sizeCacheTtlMinutes: z.number().positive().optional(),
  })
  .openapi("LocalReposConfigBody");

const LocalRepoSizesResponse = okEnvelope({
  sizes: z.record(z.string(), z.number().nullable()),
}).openapi("LocalRepoSizesResponse");

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

const DeleteBody = z
  .object({ path: z.string(), force: z.boolean().optional() })
  .openapi("LocalRepoDeleteBody");
/** 409 body when a repo isn't a safe delete target and `force` wasn't set. */
const DeleteBlockedResponse = z
  .object({ ok: z.literal(false), error: z.string(), blockers: z.array(z.string()) })
  .openapi("LocalRepoDeleteBlocked");

/**
 * AppleScript that moves the folder named by argv[0] to the Trash via Finder
 * (recoverable). The path is passed as an `argv` item — never interpolated into
 * the script source — so it's always a single literal, same discipline as
 * `OPEN_ARGS`. Run with `execFile("osascript", [...TRASH_SCRIPT, path])`.
 */
const TRASH_SCRIPT = [
  "-e",
  "on run argv",
  "-e",
  'tell application "Finder" to delete (POSIX file (item 1 of argv) as alias)',
  "-e",
  "end run",
];

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
      method: "get",
      path: "/api/local-repos/sizes",
      tags: ["local"],
      responses: {
        200: {
          content: { "application/json": { schema: LocalRepoSizesResponse } },
          description: "On-disk sizes (TTL-cached) for the scanned repos, keyed by path",
        },
        500: { ...errContent, description: "Scan error" },
      },
    }),
    // Measures `du` only for repos whose cached size is older than the configured
    // TTL; fresh ones are reused. The frontend calls this after a scan (and when
    // the disk view opens) to fill in sizes the fast scan deliberately skipped.
    async (c) => {
      const scan = await getLocalReposCached(false);
      if (!scan.ok) return c.json({ ok: false as const, error: scan.error }, 500);
      const { sizeCacheTtlMinutes } = await getConfig();
      const sizes = await refreshSizes(
        scan.repos.map((r) => r.path),
        sizeCacheTtlMinutes * 60_000,
      );
      return c.json({ ok: true as const, sizes: Object.fromEntries(sizes) }, 200);
    },
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

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/local-repos/delete",
      tags: ["local"],
      request: {
        body: { content: { "application/json": { schema: DeleteBody } } },
      },
      responses: {
        200: {
          content: { "application/json": { schema: okEnvelope({}) } },
          description: "Moved the repo to the Trash",
        },
        403: { ...errContent, description: "Path is not a scanned repo, or is a scan root" },
        409: {
          content: { "application/json": { schema: DeleteBlockedResponse } },
          description: "Not a safe delete target and force was not set",
        },
        500: { ...errContent, description: "Trash command failed" },
      },
    }),
    async (c) => {
      const { path, force } = c.req.valid("json");
      const scan = await getLocalReposCached(false);
      if (!scan.ok) return c.json({ ok: false as const, error: scan.error }, 500);

      // Guard 1 (security boundary): only ever act on an exact scanned-repo path.
      if (!scan.repos.some((r) => r.path === path)) {
        return c.json({ ok: false as const, error: "Path is not a scanned repository" }, 403);
      }
      // Guard 2: never delete a scan root — that would nuke a parent of many repos.
      const roots = await getScanRoots();
      if (roots.some((r) => resolve(r) === resolve(path))) {
        return c.json({ ok: false as const, error: "Refusing to delete a scan root" }, 403);
      }
      // Guard 3: re-validate safety server-side (don't trust the client). Rebuild the
      // worktree cluster this path belongs to and refuse unless safe or forced.
      const unit = arrangeLocalRepos(scan.repos, "size_desc").find(
        (u) => u.primary.path === path || u.worktrees.some((w) => w.path === path),
      );
      if (unit && !force) {
        const safety = assessSafety(unit);
        if (!safety.safe) {
          return c.json(
            {
              ok: false as const,
              error: "Repo is not a safe delete target",
              blockers: safety.blockers,
            },
            409,
          );
        }
      }

      try {
        await execFileAsync("osascript", [...TRASH_SCRIPT, path], { timeout: 10_000 });
      } catch (err) {
        logger.error({ err, path }, "failed to move local repo to Trash");
        return c.json({ ok: false as const, error: errorMessage(err) }, 500);
      }
      invalidateLocalReposCache();
      logger.info({ path, force: force ?? false }, "moved local repo to Trash");
      return c.json({ ok: true as const }, 200);
    },
  );
}
