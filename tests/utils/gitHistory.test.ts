import { describe, expect, it } from "vitest";
import {
  parseChangedFiles,
  parseCommitLog,
  parseCommitMeta,
  parseRefs,
} from "../../src/utils/gitHistory";

const FIELD = "\x1f";
const RECORD = "\x1e";

/** Build one `git log` record from fields, matching the route's format string. */
function logRecord(fields: {
  sha: string;
  parents: string;
  author: string;
  date: string;
  refs: string;
  subject: string;
}): string {
  return [fields.sha, fields.parents, fields.author, fields.date, fields.refs, fields.subject].join(
    FIELD,
  );
}

describe("parseRefs", () => {
  it("returns an empty list when there is no decoration", () => {
    expect(parseRefs("")).toEqual([]);
    expect(parseRefs("   ")).toEqual([]);
  });

  it("splits HEAD -> branch, strips tag: prefix, keeps remotes", () => {
    expect(parseRefs("HEAD -> main, origin/main, tag: v1.2.0")).toEqual([
      "HEAD",
      "main",
      "origin/main",
      "v1.2.0",
    ]);
  });
});

describe("parseCommitLog", () => {
  it("parses delimited records into commit nodes, newest first", () => {
    const stdout = [
      logRecord({
        sha: "a".repeat(40),
        parents: `${"b".repeat(40)} ${"c".repeat(40)}`,
        author: "Ada",
        date: "2026-06-01T10:00:00Z",
        refs: "HEAD -> main",
        subject: "Merge feature",
      }),
      logRecord({
        sha: "b".repeat(40),
        parents: "c".repeat(40),
        author: "Bo",
        date: "2026-05-30T09:00:00Z",
        refs: "",
        subject: "Add thing",
      }),
      // Root commit: no parents.
      logRecord({
        sha: "c".repeat(40),
        parents: "",
        author: "Cy",
        date: "2026-05-29T08:00:00Z",
        refs: "tag: v0",
        subject: "Initial",
      }),
      // `--pretty=format` joins records with a newline after each RS; the parser
      // must tolerate the leading "\n" on records 2+.
    ].join(`${RECORD}\n`);

    const commits = parseCommitLog(stdout);
    expect(commits).toHaveLength(3);
    expect(commits[0]).toEqual({
      sha: "a".repeat(40),
      parents: ["b".repeat(40), "c".repeat(40)],
      author: "Ada",
      date: "2026-06-01T10:00:00Z",
      refs: ["HEAD", "main"],
      subject: "Merge feature",
    });
    expect(commits[1]?.parents).toEqual(["c".repeat(40)]);
    expect(commits[2]?.parents).toEqual([]);
    expect(commits[2]?.refs).toEqual(["v0"]);
  });

  it("returns an empty array for empty output", () => {
    expect(parseCommitLog("")).toEqual([]);
  });
});

describe("parseCommitMeta", () => {
  it("parses sha/author/dates and preserves a multi-line message", () => {
    const message = "Subject line\n\nBody paragraph with detail.";
    const stdout = ["d".repeat(40), "Ada", "2026-06-01T10:00:00Z", "2026-06-01T10:05:00Z", message]
      .join(FIELD)
      .concat("\n");

    expect(parseCommitMeta(stdout)).toEqual({
      sha: "d".repeat(40),
      author: "Ada",
      authorDate: "2026-06-01T10:00:00Z",
      commitDate: "2026-06-01T10:05:00Z",
      message,
    });
  });
});

describe("parseChangedFiles", () => {
  it("merges numstat counts with name-status letters", () => {
    const numstat = ["10\t2\tsrc/a.ts", "5\t0\tsrc/b.ts", "0\t8\tsrc/gone.ts"].join("\n");
    const nameStatus = ["M\tsrc/a.ts", "A\tsrc/b.ts", "D\tsrc/gone.ts"].join("\n");

    expect(parseChangedFiles(numstat, nameStatus)).toEqual([
      { path: "src/a.ts", status: "M", additions: 10, deletions: 2 },
      { path: "src/b.ts", status: "A", additions: 5, deletions: 0 },
      { path: "src/gone.ts", status: "D", additions: 0, deletions: 8 },
    ]);
  });

  it("represents binary files with null line counts", () => {
    const numstat = "-\t-\tassets/logo.png";
    const nameStatus = "M\tassets/logo.png";
    expect(parseChangedFiles(numstat, nameStatus)).toEqual([
      { path: "assets/logo.png", status: "M", additions: null, deletions: null },
    ]);
  });

  it("falls back to M when name-status lacks the path", () => {
    expect(parseChangedFiles("1\t1\tsrc/x.ts", "")).toEqual([
      { path: "src/x.ts", status: "M", additions: 1, deletions: 1 },
    ]);
  });
});
