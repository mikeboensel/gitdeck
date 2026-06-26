import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildRepoMenu, type RepoMenuActions } from "../../src/menus/repoMenu";
import type { GhRepo } from "../../src/types/github";

const t = (k: string) => k;

const repo = {
  nameWithOwner: "octocat/hello",
  url: "https://github.com/octocat/hello",
} as GhRepo;

function makeActions(): RepoMenuActions {
  return {
    onOpen: vi.fn(),
    onViewIssues: vi.fn(),
    onClone: vi.fn(),
  };
}

const openSpy = vi.fn();
const writeText = vi.fn();

beforeEach(() => {
  openSpy.mockReset();
  writeText.mockReset();
  vi.stubGlobal("open", openSpy);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildRepoMenu", () => {
  it("returns the expected fixed set of items in order", () => {
    const items = buildRepoMenu(repo, makeActions(), t);
    expect(items.map((i) => i.key)).toEqual([
      "open",
      "issues",
      "clone",
      "github",
      "copyName",
      "copyUrl",
    ]);
  });

  it("routes onSelect to the right injected action", () => {
    const actions = makeActions();
    const items = buildRepoMenu(repo, actions, t);
    const byKey = (k: string) => items.find((i) => i.key === k);

    byKey("open")?.onSelect();
    expect(actions.onOpen).toHaveBeenCalledWith(repo);

    byKey("issues")?.onSelect();
    expect(actions.onViewIssues).toHaveBeenCalledWith(repo);

    byKey("clone")?.onSelect();
    expect(actions.onClone).toHaveBeenCalledWith(repo);
  });

  it("opens the repo URL on GitHub in a new tab", () => {
    const items = buildRepoMenu(repo, makeActions(), t);
    items.find((i) => i.key === "github")?.onSelect();
    expect(openSpy).toHaveBeenCalledWith(repo.url, "_blank", "noopener,noreferrer");
  });

  it("copies name and url to the clipboard", () => {
    const items = buildRepoMenu(repo, makeActions(), t);
    items.find((i) => i.key === "copyName")?.onSelect();
    expect(writeText).toHaveBeenCalledWith(repo.nameWithOwner);

    items.find((i) => i.key === "copyUrl")?.onSelect();
    expect(writeText).toHaveBeenCalledWith(repo.url);
  });
});
