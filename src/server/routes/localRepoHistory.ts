import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { HttpBindings } from "@hono/node-server";
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import {
  DEFAULT_HISTORY_LIMIT,
  GIT_MAX_BUFFER,
  GIT_TIMEOUT_MS,
  MAX_HISTORY_LIMIT,
} from "../../utils/commitGraphConfig";
import { parseChangedFiles, parseCommitMeta } from "../../utils/gitHistory";
import { getRepoHistory, gitErrorMessage, type HistoryOrder } from "../localHistoryCache";
import { getLocalReposCached, invalidateLocalReposCache } from "../localReposData";
import { logger } from "../logger";
import { errEnvelope, okEnvelope } from "../openapi/envelope";

type App = OpenAPIHono<{ Bindings: HttpBindings }>;

const execFileAsync = promisify(execFile);
const errContent = { content: { "application/json": { schema: errEnvelope } } };

/** A 40-char-or-shorter hex object id. Guards the `sha` inputs against anything
 * git could interpret as an option or a surprising revspec. */
const shaSchema = z.string().regex(/^[0-9a-fA-F]{7,40}$/, "invalid commit sha");

/**
 * Conservative branch-name guard. Crucially rejects a leading `-` (which `git
 * checkout -b <name>` would treat as an option) and shell/ref metacharacters;
 * git's own `checkout -b` surfaces any remaining ref-format violation.
 */
const branchNameSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^(?!-)[A-Za-z0-9._/-]+$/, "invalid branch name")
  .refine(
    (n) => !n.includes("..") && !n.endsWith("/") && !n.endsWith(".lock"),
    "invalid branch name",
  );

const HistoryQuery = z.object({
  path: z.string(),
  limit: z.string().optional(),
  order: z.enum(["date", "topo"]).optional(),
});
const HistoryResponse = okEnvelope({
  commits: z.array(z.unknown()),
  head: z.string().nullable(),
  currentBranch: z.string().nullable(),
  /** True when more commits exist than the `limit` returned (history was capped). */
  truncated: z.boolean(),
}).openapi("LocalRepoHistoryResponse");

const CommitQuery = z.object({ path: z.string(), sha: shaSchema });
const CommitResponse = okEnvelope({
  commit: z.unknown(),
  files: z.array(z.unknown()),
}).openapi("LocalRepoCommitResponse");

const CreateBranchBody = z
  .object({ path: z.string(), sha: shaSchema, name: branchNameSchema })
  .openapi("LocalRepoCreateBranchBody");
const CreateBranchResponse = okEnvelope({ branch: z.string() }).openapi(
  "LocalRepoCreateBranchResponse",
);

/** Run `git -C <path> <args>` with no shell (args are always literals). Throws on
 * non-zero exit; the error carries `.stderr` for surfacing git's own message. */
async function git(path: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", path, ...args], {
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: GIT_MAX_BUFFER,
  });
  return stdout;
}

/**
 * The security boundary shared by every handler here (same discipline as
 * `/api/local-repos/open`): only ever run git against a path that the scan already
 * surfaced. Returns "error" when the scan itself failed, false when the path isn't
 * a known repo, true otherwise.
 */
async function isScannedRepo(path: string): Promise<boolean | "error"> {
  const scan = await getLocalReposCached(false);
  if (!scan.ok) return "error";
  return scan.repos.some((repo) => repo.path === path);
}

export function registerLocalRepoHistory(app: App): void {
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/local-repos/history",
      tags: ["local"],
      request: { query: HistoryQuery },
      responses: {
        200: {
          content: { "application/json": { schema: HistoryResponse } },
          description: "Commit DAG for a local repo",
        },
        403: { ...errContent, description: "Path is not a scanned repo" },
        500: { ...errContent, description: "git failed" },
      },
    }),
    async (c) => {
      const { path, limit, order } = c.req.valid("query");
      const scanned = await isScannedRepo(path);
      if (scanned === "error") {
        return c.json({ ok: false as const, error: "local repo scan failed" }, 500);
      }
      if (!scanned) {
        return c.json({ ok: false as const, error: "Path is not a scanned repository" }, 403);
      }
      const n = Math.min(Math.max(Number(limit) || DEFAULT_HISTORY_LIMIT, 1), MAX_HISTORY_LIMIT);
      try {
        // Cached + ref-fingerprint-invalidated; only a cache miss pays for the walk.
        const history = await getRepoHistory(path, (order ?? "date") as HistoryOrder, n);
        return c.json({ ok: true as const, ...history }, 200);
      } catch (err) {
        logger.error({ err, path }, "git history failed");
        return c.json({ ok: false as const, error: gitErrorMessage(err) }, 500);
      }
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/local-repos/commit",
      tags: ["local"],
      request: { query: CommitQuery },
      responses: {
        200: {
          content: { "application/json": { schema: CommitResponse } },
          description: "Commit message + changed files",
        },
        400: { ...errContent, description: "Invalid sha" },
        403: { ...errContent, description: "Path is not a scanned repo" },
        500: { ...errContent, description: "git failed" },
      },
    }),
    async (c) => {
      const { path, sha } = c.req.valid("query");
      const scanned = await isScannedRepo(path);
      if (scanned === "error") {
        return c.json({ ok: false as const, error: "local repo scan failed" }, 500);
      }
      if (!scanned) {
        return c.json({ ok: false as const, error: "Path is not a scanned repository" }, 403);
      }
      try {
        const meta = await git(path, ["show", "-s", "--format=%H%x1f%an%x1f%aI%x1f%cI%x1f%B", sha]);
        // `--root` makes the initial (parentless) commit report its files too;
        // `--first-parent` keeps merges to a single, meaningful diff.
        const diffArgs = ["diff-tree", "--no-commit-id", "-r", "--root", "--first-parent"];
        const numstat = await git(path, [...diffArgs, "--numstat", sha]);
        const nameStatus = await git(path, [...diffArgs, "--name-status", sha]);
        return c.json(
          {
            ok: true as const,
            commit: parseCommitMeta(meta),
            files: parseChangedFiles(numstat, nameStatus),
          },
          200,
        );
      } catch (err) {
        logger.error({ err, path, sha }, "git commit detail failed");
        return c.json({ ok: false as const, error: gitErrorMessage(err) }, 500);
      }
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/local-repos/create-branch",
      tags: ["local"],
      request: {
        body: { content: { "application/json": { schema: CreateBranchBody } } },
      },
      responses: {
        200: {
          content: { "application/json": { schema: CreateBranchResponse } },
          description: "Created and checked out the branch",
        },
        400: { ...errContent, description: "Invalid request" },
        403: { ...errContent, description: "Path is not a scanned repo" },
        409: { ...errContent, description: "Working tree is dirty" },
        500: { ...errContent, description: "git failed" },
      },
    }),
    async (c) => {
      const { path, sha, name } = c.req.valid("json");
      const scanned = await isScannedRepo(path);
      if (scanned === "error") {
        return c.json({ ok: false as const, error: "local repo scan failed" }, 500);
      }
      if (!scanned) {
        return c.json({ ok: false as const, error: "Path is not a scanned repository" }, 403);
      }
      try {
        // Checking out an arbitrary historical SHA rewrites the working tree, which
        // can clobber or conflict with uncommitted work — refuse on a dirty tree.
        const status = await git(path, ["status", "--porcelain"]);
        if (status.trim()) {
          return c.json(
            {
              ok: false as const,
              error: "Working tree has uncommitted changes — commit or stash them first.",
            },
            409,
          );
        }
        await git(path, ["checkout", "-b", name, sha]);
      } catch (err) {
        logger.error({ err, path, sha, name }, "create branch failed");
        return c.json({ ok: false as const, error: gitErrorMessage(err) }, 500);
      }
      // The repo's current branch changed; force a rescan on the next list load.
      invalidateLocalReposCache();
      logger.info({ path, name, sha }, "created branch from commit");
      return c.json({ ok: true as const, branch: name }, 200);
    },
  );
}
