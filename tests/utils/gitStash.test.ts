import { describe, expect, it } from "vitest";
import { parseStashList, parseStashSubject } from "../../src/utils/gitStash";

const FIELD = "\x1f";
const RECORD = "\0";

/** Build one `git stash list -z --format=%gd%x1f%H%x1f%aI%x1f%gs` record. */
function rec(ref: string, sha: string, date: string, subject: string): string {
  return [ref, sha, date, subject].join(FIELD) + RECORD;
}

describe("parseStashSubject", () => {
  it("splits the `WIP on <branch>: …` auto-stash form", () => {
    expect(parseStashSubject("WIP on master: 887914c fix the thing")).toEqual({
      branch: "master",
      message: "887914c fix the thing",
    });
  });

  it("splits the `On <branch>: <message>` push form", () => {
    expect(parseStashSubject("On feature/INK-1908: staged work")).toEqual({
      branch: "feature/INK-1908",
      message: "staged work",
    });
  });

  it("falls back to a null branch when neither shape matches", () => {
    expect(parseStashSubject("some freeform note")).toEqual({
      branch: null,
      message: "some freeform note",
    });
  });
});

describe("parseStashList", () => {
  it("returns an empty list for empty output", () => {
    expect(parseStashList("")).toEqual([]);
  });

  it("parses NUL-delimited records into stash entries", () => {
    const raw =
      rec("stash@{0}", "abc123", "2026-06-25T15:16:41-04:00", "WIP on master: 887914c fix") +
      rec("stash@{1}", "def456", "2026-06-01T17:15:35-04:00", "On feature/x: staged work");
    const stashes = parseStashList(raw);
    expect(stashes).toHaveLength(2);
    expect(stashes[0]).toEqual({
      ref: "stash@{0}",
      index: 0,
      sha: "abc123",
      date: "2026-06-25T15:16:41-04:00",
      branch: "master",
      message: "887914c fix",
      subject: "WIP on master: 887914c fix",
    });
    expect(stashes[1]?.index).toBe(1);
    expect(stashes[1]?.branch).toBe("feature/x");
  });

  it("reads the index from the `stash@{N}` selector, not record order", () => {
    // A filtered/sparse list still maps each entry to its true stack index.
    const raw = rec("stash@{3}", "aaa", "2026-06-25T00:00:00Z", "On main: later");
    expect(parseStashList(raw)[0]?.index).toBe(3);
  });

  it("does not over-count when a stash message contains a newline", () => {
    const raw = rec("stash@{0}", "aaa", "2026-06-25T00:00:00Z", "On main: line one\nline two");
    const stashes = parseStashList(raw);
    expect(stashes).toHaveLength(1);
    expect(stashes[0]?.message).toBe("line one\nline two");
  });
});
