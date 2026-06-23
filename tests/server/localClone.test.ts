import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isWithinHome, resolveCloneCommand } from "../../src/server/localClone";

describe("resolveCloneCommand", () => {
  it("uses `gh repo clone` for github.com hosts (auth handled by gh)", () => {
    const cmd = resolveCloneCommand(
      { nameWithOwner: "octocat/hello", url: "https://github.com/octocat/hello" },
      "/dest/hello",
    );
    expect(cmd).toEqual({ cmd: "gh", args: ["repo", "clone", "octocat/hello", "/dest/hello"] });
  });

  it("falls back to `git clone <url>.git` for non-github hosts", () => {
    const cmd = resolveCloneCommand(
      { nameWithOwner: "team/proj", url: "https://forgejo.example.com/team/proj" },
      "/dest/proj",
    );
    expect(cmd).toEqual({
      cmd: "git",
      args: ["clone", "https://forgejo.example.com/team/proj.git", "/dest/proj"],
    });
  });

  it("treats an unparseable URL as a git clone (surfaces a clean error downstream)", () => {
    const cmd = resolveCloneCommand({ nameWithOwner: "a/b", url: "not a url" }, "/dest/b");
    expect(cmd.cmd).toBe("git");
  });
});

describe("isWithinHome", () => {
  const home = "/home/alice";

  it("accepts the home directory itself", () => {
    expect(isWithinHome(home, home)).toBe(true);
  });

  it("accepts descendants of home", () => {
    expect(isWithinHome(join(home, "dev/repos"), home)).toBe(true);
  });

  it("rejects paths outside home", () => {
    expect(isWithinHome("/etc", home)).toBe(false);
    expect(isWithinHome("/home/bob", home)).toBe(false);
  });

  it("rejects `..` escapes that resolve outside home", () => {
    expect(isWithinHome(join(home, "../bob/secrets"), home)).toBe(false);
  });

  it("does not treat a sibling prefixed by the home name as inside", () => {
    expect(isWithinHome("/home/alice-evil", home)).toBe(false);
  });
});
