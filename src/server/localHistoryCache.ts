import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { GIT_MAX_BUFFER, GIT_TIMEOUT_MS } from "../utils/commitGraphConfig";
import { type ParsedCommit, parseCommitLog } from "../utils/gitHistory";

/**
 * Walks a local repo's commit DAG (via `git log`) and caches the parsed result,
 * invalidated by a cheap ref-state fingerprint. History is append-mostly and the
 * refs only move on commit/branch/fetch, so an unchanged repo (e.g. reopening the
 * modal, re-selecting a node) serves the cache without re-shelling git or
 * re-parsing. Git maintains its own `.git/commit-graph` walk accelerator beneath
 * this, so the cold path stays fast too.
 */

const execFileAsync = promisify(execFile);

/** Commit ordering: `date` → `--date-order` (recent on top), `topo` → `--topo-order`
 *  (each branch contiguous; better for tangled histories). */
export type HistoryOrder = "date" | "topo";

export interface RepoHistory {
  commits: ParsedCommit[];
  head: string | null;
  currentBranch: string | null;
  /** True when more commits exist than `limit` returned (history was capped). */
  truncated: boolean;
}

interface CacheEntry {
  fingerprint: string;
  value: RepoHistory;
}

// Keyed by `${path}\0${order}\0${limit}`. Small and process-lived; entries are
// cheaply revalidated against the current ref fingerprint on every read.
const cache = new Map<string, CacheEntry>();

async function git(path: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", path, ...args], {
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: GIT_MAX_BUFFER,
  });
  return stdout;
}

/** Prefer git's stderr (the human-readable reason) over the generic exec message. */
export function gitErrorMessage(err: unknown): string {
  const stderr = (err as { stderr?: string }).stderr;
  if (typeof stderr === "string" && stderr.trim()) return stderr.trim();
  return err instanceof Error ? err.message : String(err);
}

/**
 * Fingerprint of every ref's target + HEAD — changes exactly when the history a
 * walk would produce changes (commit, branch create/delete/move, fetch). Cheap:
 * one `for-each-ref` plus a `rev-parse HEAD`, no object decompression.
 */
async function refFingerprint(path: string): Promise<string> {
  const refs = await git(path, ["for-each-ref", "--format=%(objectname) %(refname)"]);
  let head = "";
  try {
    head = await git(path, ["rev-parse", "HEAD"]);
  } catch {
    head = "";
  }
  return createHash("sha1").update(refs).update("\n").update(head).digest("hex");
}

async function walk(path: string, order: HistoryOrder, limit: number): Promise<RepoHistory> {
  const orderFlag = order === "topo" ? "--topo-order" : "--date-order";
  // Fetch one extra to tell whether history was capped, then trim back to `limit`.
  const logOut = await git(path, [
    "log",
    // `--all` spans every ref, but `refs/stash` would inject the stash's WIP merge
    // commits as stray graph nodes — exclude it so only real history shows.
    "--exclude=refs/stash",
    "--all",
    orderFlag,
    "-n",
    String(limit + 1),
    "--pretty=format:%H%x1f%P%x1f%an%x1f%aI%x1f%D%x1f%s%x1e",
  ]);
  const parsed = parseCommitLog(logOut);
  const truncated = parsed.length > limit;
  const commits = truncated ? parsed.slice(0, limit) : parsed;

  // HEAD / current branch are best-effort (empty repo, detached HEAD, …).
  let head: string | null = null;
  let currentBranch: string | null = null;
  try {
    head = (await git(path, ["rev-parse", "HEAD"])).trim() || null;
  } catch {
    head = null;
  }
  try {
    currentBranch = (await git(path, ["branch", "--show-current"])).trim() || null;
  } catch {
    currentBranch = null;
  }
  return { commits, head, currentBranch, truncated };
}

/**
 * Return a repo's commit history, served from cache when the refs are unchanged.
 * The fingerprint check (a quick `for-each-ref`) runs every call; only a cache
 * miss pays for the full `git log` walk + parse.
 */
export async function getRepoHistory(
  path: string,
  order: HistoryOrder,
  limit: number,
): Promise<RepoHistory> {
  const fingerprint = await refFingerprint(path);
  const key = `${path}\0${order}\0${limit}`;
  const hit = cache.get(key);
  if (hit && hit.fingerprint === fingerprint) return hit.value;

  const value = await walk(path, order, limit);
  cache.set(key, { fingerprint, value });
  return value;
}
