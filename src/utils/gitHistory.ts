/**
 * Pure parsers for the local git-history endpoints (`src/server/routes/localRepoHistory.ts`).
 * Kept free of any `child_process`/`fs` access so they're unit-testable from the
 * mirrored `tests/utils/` path — the route module shells out to `git` and feeds the
 * raw stdout here.
 *
 * The history log is emitted with `--pretty=format:%H%x1f%P%x1f%an%x1f%aI%x1f%D%x1f%s%x1e`,
 * i.e. fields separated by US (`\x1f`) and records by RS (`\x1e`).
 */

const FIELD = "\x1f";
const RECORD = "\x1e";

/** One commit node in the DAG, parsed from the delimited `git log` output. */
export interface ParsedCommit {
  /** Full 40-char commit SHA. */
  sha: string;
  /** Parent SHAs (empty for a root commit; >1 for a merge). */
  parents: string[];
  /** Author name (`%an`). */
  author: string;
  /** Author date, ISO-8601 (`%aI`). */
  date: string;
  /** Ref names pointing at this commit (branch tips, tags, HEAD). */
  refs: string[];
  /** Commit subject line (`%s`). */
  subject: string;
}

/**
 * Normalize the `%D` decoration string (e.g. `HEAD -> main, origin/main, tag: v1`)
 * into a flat list of ref names: `["HEAD", "main", "origin/main", "v1"]`. The
 * `HEAD -> branch` form is split into both parts and the `tag: ` prefix dropped.
 */
export function parseRefs(decoration: string): string[] {
  if (!decoration.trim()) return [];
  return decoration.split(",").flatMap((part) => {
    const ref = part.trim();
    if (!ref) return [];
    if (ref.includes("->")) {
      return ref
        .split("->")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (ref.startsWith("tag: ")) return [ref.slice("tag: ".length).trim()];
    return [ref];
  });
}

/** Parse the delimited `git log` output into commit nodes (newest first). */
export function parseCommitLog(stdout: string): ParsedCommit[] {
  return stdout
    .split(RECORD)
    .map((record) => record.replace(/^\n/, ""))
    .filter((record) => record.trim().length > 0)
    .map((record) => {
      const [sha = "", parents = "", author = "", date = "", refs = "", subject = ""] =
        record.split(FIELD);
      return {
        sha: sha.trim(),
        parents: parents.split(" ").filter(Boolean),
        author,
        date,
        refs: parseRefs(refs),
        subject,
      };
    });
}

/** Author/committer metadata + full message for a single commit. */
export interface ParsedCommitMeta {
  sha: string;
  author: string;
  /** Author date, ISO-8601 (`%aI`). */
  authorDate: string;
  /** Committer date, ISO-8601 (`%cI`). */
  commitDate: string;
  /** Raw commit message body (`%B`), subject + body. */
  message: string;
}

/** Parse `git show -s --format=%H%x1f%an%x1f%aI%x1f%cI%x1f%B`. */
export function parseCommitMeta(stdout: string): ParsedCommitMeta {
  const [sha = "", author = "", authorDate = "", commitDate = "", ...rest] = stdout.split(FIELD);
  return {
    sha: sha.trim(),
    author,
    authorDate,
    commitDate,
    // %B is the last field and may itself contain newlines; rejoin defensively.
    message: rest.join(FIELD).trim(),
  };
}

/** One changed file in a commit, merged from `--numstat` and `--name-status`. */
export interface ChangedFile {
  path: string;
  /** Single-letter status: A(dded), M(odified), D(eleted), T(ype change), etc. */
  status: string;
  /** Lines added; null for a binary file (`-` in numstat). */
  additions: number | null;
  /** Lines deleted; null for a binary file. */
  deletions: number | null;
}

/**
 * Merge `git diff-tree --numstat` and `--name-status` output (both keyed by path)
 * into one changed-file list. Rename detection is intentionally off, so a rename
 * surfaces as a delete + add pair (no `{old => new}` path forms to parse).
 */
export function parseChangedFiles(numstatOut: string, nameStatusOut: string): ChangedFile[] {
  const statusByPath = new Map<string, string>();
  for (const line of nameStatusOut.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    const path = parts[parts.length - 1] ?? "";
    // `parts[0]` is the status code (e.g. "M", or "R100" with rename detection on).
    statusByPath.set(path, (parts[0] ?? "M").charAt(0));
  }

  const files: ChangedFile[] = [];
  for (const line of numstatOut.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    const added = parts[0] ?? "-";
    const deleted = parts[1] ?? "-";
    const path = parts[parts.length - 1] ?? "";
    files.push({
      path,
      status: statusByPath.get(path) ?? "M",
      additions: added === "-" ? null : Number(added),
      deletions: deleted === "-" ? null : Number(deleted),
    });
  }
  return files;
}
