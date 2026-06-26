import { describe, expect, it } from "vitest";
import type { IssueFilters, PullRequestFilters, RepoFilters } from "../../src/utils/dashboard";
import {
  countIssueFilters,
  countLocalFilters,
  countPrFilters,
  countRepoFilters,
} from "../../src/utils/footer";
import type { LocalRepoFilters } from "../../src/utils/localRepos";

const repoFilters = (over: Partial<RepoFilters> = {}): RepoFilters => ({
  search: "",
  orgs: new Set(),
  languages: new Set(),
  collaborators: new Set(),
  visibility: "all",
  includeForks: true,
  includeArchived: false,
  ...over,
});

const issueFilters = (over: Partial<IssueFilters> = {}): IssueFilters => ({
  search: "",
  orgs: new Set(),
  repos: new Set(),
  labels: new Set(),
  authors: new Set(),
  assignees: new Set(),
  dates: { cf: "", ct: "", uf: "", ut: "" },
  preset: "",
  ...over,
});

const localFilters = (over: Partial<LocalRepoFilters> = {}): LocalRepoFilters => ({
  search: "",
  owners: new Set(),
  hosts: new Set(),
  remotes: new Set(),
  status: "all",
  stash: "all",
  ...over,
});

describe("countRepoFilters", () => {
  it("is 0 for the default view", () => {
    expect(countRepoFilters(repoFilters())).toBe(0);
  });

  it("sums facet selections", () => {
    expect(
      countRepoFilters(repoFilters({ orgs: new Set(["a"]), languages: new Set(["ts", "go"]) })),
    ).toBe(3);
  });

  it("counts non-default toggles: visibility, excluded forks, included archived", () => {
    expect(countRepoFilters(repoFilters({ visibility: "private" }))).toBe(1);
    expect(countRepoFilters(repoFilters({ includeForks: false }))).toBe(1);
    expect(countRepoFilters(repoFilters({ includeArchived: true }))).toBe(1);
  });

  it("does not count search", () => {
    expect(countRepoFilters(repoFilters({ search: "hello" }))).toBe(0);
  });
});

describe("countIssueFilters / countPrFilters", () => {
  it("are 0 for the default view", () => {
    expect(countIssueFilters(issueFilters())).toBe(0);
    expect(countPrFilters(issueFilters() as PullRequestFilters)).toBe(0);
  });

  it("sum the five facet groups and ignore search/preset", () => {
    const f = issueFilters({
      orgs: new Set(["o"]),
      repos: new Set(["r1", "r2"]),
      labels: new Set(["bug"]),
      authors: new Set(["me"]),
      assignees: new Set(["you"]),
      search: "x",
      preset: "ready",
    });
    expect(countIssueFilters(f)).toBe(6);
    expect(countPrFilters(f as PullRequestFilters)).toBe(6);
  });
});

describe("countLocalFilters", () => {
  it("is 0 for the default view", () => {
    expect(countLocalFilters(localFilters())).toBe(0);
  });

  it("sums facets plus the non-default status, excluding search", () => {
    expect(
      countLocalFilters(
        localFilters({ owners: new Set(["a"]), hosts: new Set(["github.com"]), status: "dirty" }),
      ),
    ).toBe(3);
    expect(countLocalFilters(localFilters({ search: "x" }))).toBe(0);
  });
});
