import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildLocalRepoMenu, type LocalRepoMenuActions } from "../../src/menus/localRepoMenu";
import type { GhRepo, LocalRepo } from "../../src/types/github";

const t = (k: string) => k;

function makeRepo(overrides: Partial<LocalRepo> = {}): LocalRepo {
  return {
    path: "/Users/me/code/proj",
    stashCount: 0,
    enrichment: null,
    ...overrides,
  } as LocalRepo;
}

function makeActions(): LocalRepoMenuActions {
  return {
    onReveal: vi.fn(),
    onOpenInCursor: vi.fn(),
    onOpenInTerminal: vi.fn(),
    onViewHistory: vi.fn(),
    onViewStashes: vi.fn(),
    onViewChanges: vi.fn(),
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

describe("buildLocalRepoMenu", () => {
  it("omits the stashes item when stashCount is 0", () => {
    const items = buildLocalRepoMenu(makeRepo({ stashCount: 0 }), makeActions(), t);
    expect(items.some((i) => i.key === "stashes")).toBe(false);
  });

  it("inserts the stashes item at index 1 when stashCount > 0", () => {
    const items = buildLocalRepoMenu(makeRepo({ stashCount: 3 }), makeActions(), t);
    expect(items.findIndex((i) => i.key === "stashes")).toBe(1);
    // It sits between history and finder.
    expect(items.map((i) => i.key).slice(0, 3)).toEqual(["history", "stashes", "finder"]);
  });

  it("omits the changes item when the working tree is clean", () => {
    const items = buildLocalRepoMenu(makeRepo({ dirty: false }), makeActions(), t);
    expect(items.some((i) => i.key === "changes")).toBe(false);
  });

  it("prepends the changes item when the working tree is dirty", () => {
    const actions = makeActions();
    const repo = makeRepo({ dirty: true });
    const items = buildLocalRepoMenu(repo, actions, t);
    expect(items[0]?.key).toBe("changes");
    items[0]?.onSelect();
    expect(actions.onViewChanges).toHaveBeenCalledWith(repo);
  });

  it("omits the github item for a local-only repo (no enrichment)", () => {
    const items = buildLocalRepoMenu(makeRepo({ enrichment: null }), makeActions(), t);
    expect(items.some((i) => i.key === "github")).toBe(false);
  });

  it("appends the github item only when enrichment is present", () => {
    const enrichment = { url: "https://github.com/octocat/hello" } as GhRepo;
    const items = buildLocalRepoMenu(makeRepo({ enrichment }), makeActions(), t);
    const github = items.find((i) => i.key === "github");
    expect(github).toBeDefined();

    github?.onSelect();
    expect(openSpy).toHaveBeenCalledWith(enrichment.url, "_blank", "noopener,noreferrer");
  });

  it("routes each item's onSelect to the correct injected action", () => {
    const actions = makeActions();
    const repo = makeRepo({ stashCount: 1 });
    const items = buildLocalRepoMenu(repo, actions, t);
    const byKey = (k: string) => items.find((i) => i.key === k);

    byKey("history")?.onSelect();
    expect(actions.onViewHistory).toHaveBeenCalledWith(repo);

    byKey("stashes")?.onSelect();
    expect(actions.onViewStashes).toHaveBeenCalledWith(repo);

    byKey("finder")?.onSelect();
    expect(actions.onReveal).toHaveBeenCalledWith(repo);

    byKey("cursor")?.onSelect();
    expect(actions.onOpenInCursor).toHaveBeenCalledWith(repo);

    byKey("terminal")?.onSelect();
    expect(actions.onOpenInTerminal).toHaveBeenCalledWith(repo);
  });

  it("copies the repo path to the clipboard", () => {
    const repo = makeRepo();
    const items = buildLocalRepoMenu(repo, makeActions(), t);
    items.find((i) => i.key === "copyPath")?.onSelect();
    expect(writeText).toHaveBeenCalledWith(repo.path);
  });
});
