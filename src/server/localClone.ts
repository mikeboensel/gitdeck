import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";

/**
 * Clone helpers for the right-click "Clone" action. The subprocess invocation
 * (gh/git) and the path-safety boundary live here as pure functions so they can
 * be unit-tested without touching the filesystem or spawning processes.
 */

export interface CloneTarget {
  /** "owner/repo" — used by `gh repo clone`. */
  nameWithOwner: string;
  /** The repo's web URL (e.g. https://github.com/owner/repo) — has no `.git`. */
  url: string;
}

export interface CloneCommand {
  cmd: "gh" | "git";
  args: string[];
}

/**
 * Pick the clone command for a repo. github.com hosts go through `gh repo clone`
 * so the stored gh auth is used transparently (private repos work); every other
 * host (Forgejo, GitHub Enterprise, …) falls back to `git clone <url>.git`.
 * `target` is the absolute destination directory for the working copy.
 */
export function resolveCloneCommand(repo: CloneTarget, target: string): CloneCommand {
  let host = "";
  try {
    host = new URL(repo.url).hostname;
  } catch {
    // Unparseable URL — fall through to the git path; it'll surface a clean error.
  }
  if (host === "github.com") {
    return { cmd: "gh", args: ["repo", "clone", repo.nameWithOwner, target] };
  }
  return { cmd: "git", args: ["clone", `${repo.url}.git`, target] };
}

/**
 * Security boundary for browse/clone: a path is allowed only when it is the home
 * directory or a descendant of it. Guards against traversing to arbitrary
 * filesystem locations (`/etc`, `..` escapes, etc.).
 */
export function isWithinHome(p: string, home: string = homedir()): boolean {
  const resolved = resolve(p);
  const root = resolve(home);
  return resolved === root || resolved.startsWith(root + sep);
}

export interface DirEntry {
  name: string;
  path: string;
}

/** Immediate child directories of `path` (no files, symlinks, or dotfiles), sorted by name. */
export async function listChildDirs(path: string): Promise<DirEntry[]> {
  const entries = await readdir(path, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !e.isSymbolicLink() && !e.name.startsWith("."))
    .map((e) => ({ name: e.name, path: join(path, e.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
