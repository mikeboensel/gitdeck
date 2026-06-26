import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { HttpBindings } from "@hono/node-server";
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { parseChangedFiles } from "../../utils/gitHistory";
import { gitErrorMessage } from "../localHistoryCache";
import { getLocalReposCached } from "../localReposData";
import { logger } from "../logger";
import { errEnvelope, okEnvelope } from "../openapi/envelope";

type App = OpenAPIHono<{ Bindings: HttpBindings }>;

const execFileAsync = promisify(execFile);
const errContent = { content: { "application/json": { schema: errEnvelope } } };

const GIT_TIMEOUT_MS = 10_000;
const MAX_BUFFER = 8 * 1024 * 1024;

/** The canonical empty-tree object, used as the diff base for a repo that has no
 * commits yet (so every working-tree file surfaces as an addition). */
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

const ChangesQuery = z.object({ path: z.string() });
const ChangesResponse = okEnvelope({
  files: z.array(z.unknown()),
  patch: z.string(),
}).openapi("LocalRepoChangesResponse");

/** Run `git -C <path> <args>` with no shell (args are always literals). An optional
 * `env` overlay lets a handler point git at a throwaway index. Throws on non-zero
 * exit; the error carries `.stderr` for surfacing git's own message. */
async function git(path: string, args: string[], env?: NodeJS.ProcessEnv): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", path, ...args], {
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
    env: env ? { ...process.env, ...env } : process.env,
  });
  return stdout;
}

/**
 * The security boundary shared with the other local-repo handlers: only ever run
 * git against a path the scan already surfaced. Returns "error" when the scan
 * itself failed, false when the path isn't a known repo, true otherwise.
 */
async function isScannedRepo(path: string): Promise<boolean | "error"> {
  const scan = await getLocalReposCached(false);
  if (!scan.ok) return "error";
  return scan.repos.some((repo) => repo.path === path);
}

export function registerLocalRepoChanges(app: App): void {
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/local-repos/changes",
      tags: ["local"],
      request: { query: ChangesQuery },
      responses: {
        200: {
          content: { "application/json": { schema: ChangesResponse } },
          description: "Uncommitted working-tree changes for a local repo",
        },
        403: { ...errContent, description: "Path is not a scanned repo" },
        500: { ...errContent, description: "git failed" },
      },
    }),
    async (c) => {
      const { path } = c.req.valid("query");
      const scanned = await isScannedRepo(path);
      if (scanned === "error") {
        return c.json({ ok: false as const, error: "local repo scan failed" }, 500);
      }
      if (!scanned) {
        return c.json({ ok: false as const, error: "Path is not a scanned repository" }, 403);
      }

      // Stage every working-tree difference — staged, unstaged, and untracked — into
      // a throwaway index so a single `git diff --cached` yields the complete
      // outstanding-changes diff. The real index is never touched; the temp index
      // lives under the OS temp dir and is removed in `finally`. (`git add -A` honors
      // .gitignore, matching the untracked count the scan reports.)
      const dir = await mkdtemp(join(tmpdir(), "gitdeck-changes-"));
      const env: NodeJS.ProcessEnv = { GIT_INDEX_FILE: join(dir, "index") };
      try {
        // Seed the temp index from HEAD, falling back to the empty tree for a repo
        // with no commits yet.
        let base = "HEAD";
        try {
          await git(path, ["read-tree", "HEAD"], env);
        } catch {
          await git(path, ["read-tree", EMPTY_TREE], env);
          base = EMPTY_TREE;
        }
        await git(path, ["add", "-A"], env);
        const diffArgs = ["diff", "--cached", base];
        const numstat = await git(path, [...diffArgs, "--numstat"], env);
        const nameStatus = await git(path, [...diffArgs, "--name-status"], env);
        const patch = await git(path, [...diffArgs, "-p"], env);
        return c.json(
          { ok: true as const, files: parseChangedFiles(numstat, nameStatus), patch },
          200,
        );
      } catch (err) {
        logger.error({ err, path }, "git working-tree diff failed");
        return c.json({ ok: false as const, error: gitErrorMessage(err) }, 500);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
}
