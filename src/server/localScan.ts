import { execFile } from "node:child_process";
import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";
import type { GitChangeCounts, LocalRemote } from "../types/github";
import { logger } from "./logger";

const execFileAsync = promisify(execFile);

/** Local git facts for one repo, before any GitHub enrichment. */
export interface ScannedRepo {
  path: string;
  name: string;
  remoteUrl: string | null;
  /** All configured remotes, read offline from .git/config. */
  remotes: LocalRemote[];
  nameWithOwner: string | null;
  host: string | null;
  branch: string | null;
  ahead: number;
  behind: number;
  dirty: boolean;
  changes: GitChangeCounts;
  lastCommit: { sha: string; date: string; message: string } | null;
  /** True when this checkout is a linked worktree (`git worktree add`), not the primary. */
  isWorktree: boolean;
  /**
   * Absolute path to the shared git common dir (the primary repo's `.git`). All
   * checkouts of one repo — the primary plus every linked worktree — share this
   * value, so it's the stable identity used to cluster them together.
   */
  gitCommonDir: string | null;
}

/**
 * Directory names pruned before descending. These hold package-manager and
 * tooling git repos (Homebrew taps live under Library/Taps, oh-my-zsh plugins,
 * vendored submodules, etc.) that aren't the user's working repos.
 */
const DEFAULT_EXCLUDE_SEGMENTS = new Set([
  "node_modules",
  "vendor",
  "bower_components",
  ".cache",
  ".Trash",
  "Library",
  "Applications",
  "Cellar",
  "Caskroom",
  ".cargo",
  ".rustup",
  ".pyenv",
  ".rbenv",
  ".nvm",
  ".gem",
  ".npm",
  ".pnpm-store",
  ".bun",
  ".venv",
  "venv",
  "site-packages",
  ".terraform",
  ".gradle",
  ".m2",
]);

const MAX_DEPTH = 10;
const GIT_TIMEOUT_MS = 8000;
const GIT_CONCURRENCY = 8;

/**
 * Parse a git remote URL into host/owner/repo. Handles scp-style
 * (`git@host:owner/repo.git`), `ssh://`, and `https://` forms.
 */
export function parseRemoteUrl(url: string): { host: string; owner: string; repo: string } | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  // scp-style: git@github.com:owner/repo(.git)
  const scp = /^[^@/]+@([^:/]+):(.+)$/.exec(trimmed);
  let host: string;
  let path: string;
  if (scp?.[1] && scp[2]) {
    host = scp[1];
    path = scp[2];
  } else {
    try {
      const parsed = new URL(trimmed);
      host = parsed.hostname;
      path = parsed.pathname.replace(/^\/+/, "");
    } catch {
      return null;
    }
  }
  const segments = path
    .replace(/\.git$/i, "")
    .split("/")
    .filter(Boolean);
  if (segments.length < 2) return null;
  const owner = segments[0];
  const repo = segments[segments.length - 1];
  if (!owner || !repo) return null;
  return { host, owner, repo };
}

/**
 * Parse `git remote -v` output into a deduped list of remotes. Output is two
 * lines per remote (fetch + push); we key off the fetch line and keep one entry
 * per remote name, preserving discovery order (origin typically first).
 */
export function parseRemotes(raw: string): LocalRemote[] {
  const byName = new Map<string, LocalRemote>();
  for (const line of raw.split("\n")) {
    const match = /^(\S+)\s+(\S+)\s+\((fetch|push)\)/.exec(line.trim());
    if (!match) continue;
    const [, name, url] = match;
    if (!name || !url || byName.has(name)) continue;
    const parsed = parseRemoteUrl(url);
    byName.set(name, {
      name,
      url,
      host: parsed?.host ?? null,
      owner: parsed?.owner ?? null,
    });
  }
  return [...byName.values()];
}

/**
 * Tally `git status --porcelain` (v1) output into change categories. Each line
 * is `XY <path>`, where X is the index/staged state and Y the working-tree
 * state. Untracked entries are `??`; unmerged (conflict) entries carry a `U` in
 * either column or are one of the `DD`/`AA` both-sided cases.
 */
export function parseStatusCounts(raw: string): GitChangeCounts {
  const counts: GitChangeCounts = { staged: 0, modified: 0, untracked: 0, conflicted: 0 };
  for (const line of raw.split("\n")) {
    if (line.length < 2) continue;
    const x = line[0];
    const y = line[1];
    if (x === "?" && y === "?") {
      counts.untracked += 1;
      continue;
    }
    if (x === "U" || y === "U" || (x === "D" && y === "D") || (x === "A" && y === "A")) {
      counts.conflicted += 1;
      continue;
    }
    if (x !== " ") counts.staged += 1;
    if (y !== " ") counts.modified += 1;
  }
  return counts;
}

async function git(cwd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    });
    return stdout;
  } catch {
    return null;
  }
}

async function readGitMeta(repoPath: string): Promise<ScannedRepo> {
  const [remotesRaw, branchRaw, statusRaw, aheadBehindRaw, lastCommitRaw, gitDirsRaw] =
    await Promise.all([
      git(repoPath, ["remote", "-v"]),
      git(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]),
      git(repoPath, ["status", "--porcelain"]),
      git(repoPath, ["rev-list", "--left-right", "--count", "@{u}...HEAD"]),
      git(repoPath, ["log", "-1", "--format=%H%n%cI%n%s"]),
      git(repoPath, ["rev-parse", "--git-dir", "--git-common-dir"]),
    ]);

  // `origin` is the authoritative remote for owner/name; fall back to the first
  // configured remote when there's no `origin`.
  const remotes = remotesRaw ? parseRemotes(remotesRaw) : [];
  const authoritative = remotes.find((r) => r.name === "origin") ?? remotes[0] ?? null;
  const remoteUrl = authoritative?.url ?? null;
  const parsed = remoteUrl ? parseRemoteUrl(remoteUrl) : null;
  const branchValue = branchRaw?.trim();
  const branch = branchValue ? branchValue : null;

  // `--left-right ... @{u}...HEAD` prints "<behind>\t<ahead>"; absent upstream -> null output.
  let ahead = 0;
  let behind = 0;
  if (aheadBehindRaw) {
    const parts = aheadBehindRaw.trim().split(/\s+/);
    const b = Number(parts[0]);
    const a = Number(parts[1]);
    if (Number.isFinite(b)) behind = b;
    if (Number.isFinite(a)) ahead = a;
  }

  // `%H%n%cI%n%s` => sha / ISO date / subject on three lines (subject has no newline).
  let lastCommit: ScannedRepo["lastCommit"] = null;
  if (lastCommitRaw) {
    const lines = lastCommitRaw.split("\n");
    const sha = lines[0]?.trim();
    const date = lines[1]?.trim();
    if (sha && date) lastCommit = { sha, date, message: lines[2] ?? "" };
  }

  const changes = parseStatusCounts(statusRaw ?? "");

  // `--git-dir --git-common-dir` prints the per-checkout gitdir then the shared
  // common dir. They're equal for the primary repo and differ for a linked
  // worktree (whose gitdir is `<common>/.git/worktrees/<name>`). Resolve both
  // against the repo path since git may emit either relative or absolute forms.
  let isWorktree = false;
  let gitCommonDir: string | null = null;
  if (gitDirsRaw) {
    const lines = gitDirsRaw.trim().split("\n");
    const gitDir = lines[0]?.trim();
    const commonDir = lines[1]?.trim();
    if (gitDir && commonDir) {
      const absGitDir = resolve(repoPath, gitDir);
      gitCommonDir = resolve(repoPath, commonDir);
      isWorktree = absGitDir !== gitCommonDir;
    }
  }

  return {
    path: repoPath,
    name: parsed?.repo ?? basename(repoPath),
    remoteUrl,
    remotes,
    nameWithOwner: parsed ? `${parsed.owner}/${parsed.repo}` : null,
    host: parsed?.host ?? null,
    branch,
    ahead,
    behind,
    dirty: changes.staged + changes.modified + changes.untracked + changes.conflicted > 0,
    changes,
    lastCommit,
    isWorktree,
    gitCommonDir,
  };
}

/** Recursively find git working directories under a root, pruning noise dirs. */
async function findRepoPaths(
  root: string,
  excludeSegments: Set<string>,
  denylist: Set<string>,
  found: string[],
  depth: number,
): Promise<void> {
  if (depth > MAX_DEPTH) return;
  let entries: Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return; // unreadable (permissions, races) — skip silently
  }

  // A directory containing `.git` is a repo: record it and don't descend further.
  if (entries.some((e) => e.name === ".git")) {
    if (!denylist.has(root)) found.push(root);
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    if (excludeSegments.has(entry.name)) continue;
    const child = join(root, entry.name);
    if (denylist.has(child)) continue;
    await findRepoPaths(child, excludeSegments, denylist, found, depth + 1);
  }
}

/** Run an async mapper over items with a bounded concurrency pool. */
export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

export interface ScanOptions {
  roots: string[];
  excludes?: string[];
  denylist?: string[];
}

/** Scan the given roots and return local git facts for every repo found. */
export async function scanLocalRepos(options: ScanOptions): Promise<ScannedRepo[]> {
  const excludeSegments = new Set(DEFAULT_EXCLUDE_SEGMENTS);
  for (const extra of options.excludes ?? []) excludeSegments.add(extra);
  const denylist = new Set(options.denylist ?? []);

  const repoPaths: string[] = [];
  const seen = new Set<string>();
  for (const root of options.roots) {
    const found: string[] = [];
    await findRepoPaths(root, excludeSegments, denylist, found, 0);
    for (const p of found) {
      if (!seen.has(p)) {
        seen.add(p);
        repoPaths.push(p);
      }
    }
  }

  logger.info({ roots: options.roots, count: repoPaths.length }, "local repo scan: paths found");
  return mapPool(repoPaths, GIT_CONCURRENCY, readGitMeta);
}
