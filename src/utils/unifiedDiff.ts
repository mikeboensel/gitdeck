/**
 * Split a multi-file unified diff (`git stash show -p` / `git diff`) into one
 * record per file. Pure — no I/O — so it's unit-testable from the mirrored
 * `tests/utils/` path. The rendered diff (syntax highlighting, split/unified) is
 * delegated to `@git-diff-view/react`, which takes one file's hunks at a time;
 * this is the only parsing the client owns.
 */

/** One file's slice of a unified diff. */
export interface PatchFile {
  /** Old path, or null when the file was added (`--- /dev/null`). */
  oldPath: string | null;
  /** New path, or null when the file was deleted (`+++ /dev/null`). */
  newPath: string | null;
  /** Display path: the new path if present, else the old one. */
  path: string;
  /**
   * The complete per-file diff segment, headers included (`diff --git`, `---`,
   * `+++`, `@@` …). `@git-diff-view` parses paths and hunks from these headers, so
   * the `@@` block alone does not render — the whole segment is required.
   */
  diff: string;
  /** True when git reported a binary file (no textual hunks to render). */
  binary: boolean;
}

/** Strip a leading `a/` or `b/` git diff prefix from a path; leave `/dev/null` alone. */
function stripPrefix(path: string): string {
  return path.replace(/^[ab]\//, "");
}

/** Pull the path out of a `--- ` / `+++ ` line, mapping `/dev/null` to null. */
function parseSideHeader(line: string): string | null {
  const raw = line.slice(4).trim();
  if (raw === "/dev/null") return null;
  return stripPrefix(raw);
}

/**
 * Split on each `diff --git ` boundary and parse the per-file headers. Falls back
 * to the `diff --git a/<old> b/<new>` line for paths when a side lacks a
 * `---`/`+++` header (e.g. a binary file or a pure mode/rename change).
 */
export function splitUnifiedDiff(patch: string): PatchFile[] {
  if (!patch.trim()) return [];
  const lines = patch.split("\n");

  // Group lines into per-file segments, each starting at a `diff --git` line.
  const segments: string[][] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      if (current) segments.push(current);
      current = [line];
    } else if (current) {
      current.push(line);
    }
  }
  if (current) segments.push(current);

  return segments.map((segment) => {
    let oldPath: string | null = null;
    let newPath: string | null = null;
    let binary = false;
    let hunkStart = -1;

    for (let i = 0; i < segment.length; i++) {
      const line = segment[i] ?? "";
      if (line.startsWith("--- ")) oldPath = parseSideHeader(line);
      else if (line.startsWith("+++ ")) newPath = parseSideHeader(line);
      else if (line.startsWith("Binary files ")) binary = true;
      else if (hunkStart === -1 && line.startsWith("@@")) hunkStart = i;
    }

    // No `---`/`+++` (binary / rename / mode change): recover paths from the header.
    if (oldPath === null && newPath === null) {
      const header = /^diff --git (\S+) (\S+)$/.exec(segment[0] ?? "");
      if (header?.[1] && header[2]) {
        oldPath = stripPrefix(header[1]);
        newPath = stripPrefix(header[2]);
      }
    }

    // Pass the whole segment (headers + hunks) — the renderer needs the `---`/`+++`
    // lines, not just the `@@` block — but flag binary/empty segments as such.
    const diff = segment.join("\n");
    const path = newPath ?? oldPath ?? "";
    return { oldPath, newPath, path, diff, binary: binary || hunkStart === -1 };
  });
}
