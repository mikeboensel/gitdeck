/**
 * Pure parsers for the local stash endpoints (`src/server/routes/localRepoStash.ts`).
 * Kept free of any `child_process`/`fs` access so they're unit-testable from the
 * mirrored `tests/utils/` path — the route module shells out to `git` and feeds the
 * raw stdout here. The per-stash changed-file list reuses `parseChangedFiles` from
 * `gitHistory.ts`, so only the stash *list* needs parsing here.
 *
 * The list is emitted with `git stash list -z --format=%gd%x1f%H%x1f%aI%x1f%gs`,
 * i.e. fields separated by US (`\x1f`) and records by NUL (`-z`).
 */

const FIELD = "\x1f";
const RECORD = "\0";

/** One entry on the stash stack, parsed from the delimited `git stash list` output. */
export interface ParsedStash {
  /** Reflog selector, e.g. `stash@{0}`. */
  ref: string;
  /** Zero-based position on the stack (0 = most recent). */
  index: number;
  /** Full 40-char SHA of the stash commit. */
  sha: string;
  /** Author date, ISO-8601 (`%aI`). */
  date: string;
  /** Branch the stash was made on, parsed from the reflog subject; null if unparseable. */
  branch: string | null;
  /** Human message with the `WIP on <branch>: ` / `On <branch>: ` prefix stripped. */
  message: string;
  /** Raw reflog subject (`%gs`), kept as a display fallback. */
  subject: string;
}

/**
 * Split a stash reflog subject (`%gs`) into its branch and message. Git writes two
 * shapes: `WIP on <branch>: <base-sha> <subject>` for auto-stashes and
 * `On <branch>: <message>` for `git stash push -m`. Returns the branch and the
 * remainder; falls back to `{ branch: null, message: <subject> }` when neither
 * shape matches (e.g. a detached HEAD stash).
 */
export function parseStashSubject(subject: string): { branch: string | null; message: string } {
  const match = /^(?:WIP on|On) ([^:]+): (.*)$/s.exec(subject);
  if (!match?.[1]) return { branch: null, message: subject };
  return { branch: match[1], message: match[2] ?? "" };
}

/** Parse the delimited `git stash list` output into stack entries (most recent first). */
export function parseStashList(stdout: string): ParsedStash[] {
  return stdout
    .split(RECORD)
    .filter((record) => record.trim().length > 0)
    .map((record, fallbackIndex) => {
      const [ref = "", sha = "", date = "", subject = ""] = record.split(FIELD);
      // Prefer the index encoded in `stash@{N}`; fall back to record order.
      const indexMatch = /stash@\{(\d+)\}/.exec(ref);
      const index = indexMatch?.[1] ? Number(indexMatch[1]) : fallbackIndex;
      const { branch, message } = parseStashSubject(subject);
      return { ref: ref.trim(), index, sha: sha.trim(), date, branch, message, subject };
    });
}
