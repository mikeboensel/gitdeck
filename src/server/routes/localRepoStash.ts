import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { HttpBindings } from "@hono/node-server";
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { parseChangedFiles } from "../../utils/gitHistory";
import { parseStashList } from "../../utils/gitStash";
import { gitErrorMessage } from "../localHistoryCache";
import { getLocalReposCached } from "../localReposData";
import { logger } from "../logger";
import { errEnvelope, okEnvelope } from "../openapi/envelope";

type App = OpenAPIHono<{ Bindings: HttpBindings }>;

const execFileAsync = promisify(execFile);
const errContent = { content: { "application/json": { schema: errEnvelope } } };

const GIT_TIMEOUT_MS = 10_000;
const MAX_BUFFER = 8 * 1024 * 1024;

/** The stash stack is shallow; cap the index to a small integer so the
 * `stash@{N}` revspec we build can never carry anything surprising. */
const indexSchema = z.string().regex(/^\d{1,4}$/, "invalid stash index");

const ListQuery = z.object({ path: z.string() });
const ListResponse = okEnvelope({ stashes: z.array(z.unknown()) }).openapi(
  "LocalRepoStashListResponse",
);

const StashQuery = z.object({ path: z.string(), index: indexSchema });
const StashResponse = okEnvelope({
  files: z.array(z.unknown()),
  patch: z.string(),
}).openapi("LocalRepoStashDetailResponse");

/** Run `git -C <path> <args>` with no shell (args are always literals). Throws on
 * non-zero exit; the error carries `.stderr` for surfacing git's own message. */
async function git(path: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", path, ...args], {
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
  });
  return stdout;
}

/**
 * The security boundary shared by every handler here (same discipline as
 * `localRepoHistory.ts`): only ever run git against a path the scan already
 * surfaced. Returns "error" when the scan itself failed, false when the path isn't
 * a known repo, true otherwise.
 */
async function isScannedRepo(path: string): Promise<boolean | "error"> {
  const scan = await getLocalReposCached(false);
  if (!scan.ok) return "error";
  return scan.repos.some((repo) => repo.path === path);
}

export function registerLocalRepoStash(app: App): void {
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/local-repos/stashes",
      tags: ["local"],
      request: { query: ListQuery },
      responses: {
        200: {
          content: { "application/json": { schema: ListResponse } },
          description: "Stash stack for a local repo",
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
      try {
        // `-z` (NUL records) + `%x1f` (US fields) so stash messages with newlines
        // can't break the framing. `refs/stash` lives in the shared common dir, so
        // this returns the same stack from any checkout of the repo.
        const raw = await git(path, ["stash", "list", "-z", "--format=%gd%x1f%H%x1f%aI%x1f%gs"]);
        return c.json({ ok: true as const, stashes: parseStashList(raw) }, 200);
      } catch (err) {
        logger.error({ err, path }, "git stash list failed");
        return c.json({ ok: false as const, error: gitErrorMessage(err) }, 500);
      }
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/local-repos/stash",
      tags: ["local"],
      request: { query: StashQuery },
      responses: {
        200: {
          content: { "application/json": { schema: StashResponse } },
          description: "Changed files for one stash entry",
        },
        400: { ...errContent, description: "Invalid index" },
        403: { ...errContent, description: "Path is not a scanned repo" },
        500: { ...errContent, description: "git failed" },
      },
    }),
    async (c) => {
      const { path, index } = c.req.valid("query");
      const scanned = await isScannedRepo(path);
      if (scanned === "error") {
        return c.json({ ok: false as const, error: "local repo scan failed" }, 500);
      }
      if (!scanned) {
        return c.json({ ok: false as const, error: "Path is not a scanned repository" }, 403);
      }
      const ref = `stash@{${index}}`;
      try {
        // `--include-untracked` so a stash of only-untracked files still reports
        // them; numstat + name-status feed the file-summary parser, while `-p`
        // gives the full unified diff the client renders.
        const showArgs = ["stash", "show", "--include-untracked"];
        const numstat = await git(path, [...showArgs, "--numstat", ref]);
        const nameStatus = await git(path, [...showArgs, "--name-status", ref]);
        const patch = await git(path, [...showArgs, "-p", ref]);
        return c.json(
          { ok: true as const, files: parseChangedFiles(numstat, nameStatus), patch },
          200,
        );
      } catch (err) {
        logger.error({ err, path, ref }, "git stash show failed");
        return c.json({ ok: false as const, error: gitErrorMessage(err) }, 500);
      }
    },
  );
}
