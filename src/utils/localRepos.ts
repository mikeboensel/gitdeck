import type { LocalRepo } from "../types/github";
import { getOwner } from "./repository";

/**
 * Filter state for the Local tab. All facet selections are remote-derived
 * (owner / host / remote URL) except `status`, which is a local git fact.
 */
export interface LocalRepoFilters {
  search: string;
  /** Owner of the authoritative remote (origin). */
  owners: Set<string>;
  /** Any remote's host (a repo can match several). */
  hosts: Set<string>;
  /** Any remote's full URL. */
  remotes: Set<string>;
  /** Working-tree state. */
  status: "all" | "dirty" | "clean";
}

export function defaultLocalFilters(): LocalRepoFilters {
  return { search: "", owners: new Set(), hosts: new Set(), remotes: new Set(), status: "all" };
}

/** Count of active (non-default) filter dimensions — drives the sidebar reset affordance. */
export function localFiltersActiveCount(f: LocalRepoFilters): number {
  return (
    f.owners.size +
    f.hosts.size +
    f.remotes.size +
    (f.status !== "all" ? 1 : 0) +
    (f.search.trim() ? 1 : 0)
  );
}

export interface LocalFacets {
  /** owner → repo count (authoritative remote only). */
  owners: Map<string, number>;
  /** host → repo count (a repo counts once per distinct host it has). */
  hosts: Map<string, number>;
  /** remote URL → occurrence count across all repos. */
  remotes: Map<string, number>;
}

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/**
 * Humanize a git remote URL for display in the facet list. Strips the scheme,
 * host, credentials, and trailing `.git`, leaving the `owner/repo` path that
 * actually distinguishes one remote from another. Falls back to the raw URL if
 * nothing recognizable can be extracted. The full URL stays the toggle value.
 */
export function shortRemote(url: string): string {
  // scp-style (git@github.com:owner/repo.git) → owner/repo
  const scp = url.match(/^[^@]+@[^:]+:(.+)$/);
  let path = scp?.[1] ?? url;
  if (!scp) {
    // Strip scheme + optional userinfo + host for URL-style remotes.
    path = path.replace(/^[a-z]+:\/\/(?:[^@/]+@)?[^/]+\//i, "");
  }
  path = path.replace(/\.git$/i, "").replace(/\/+$/, "");
  return path || url;
}

/** Build the Local-tab facet counts from the (unfiltered) repo set. */
export function buildLocalFacets(repos: LocalRepo[]): LocalFacets {
  const owners = new Map<string, number>();
  const hosts = new Map<string, number>();
  const remotes = new Map<string, number>();
  for (const repo of repos) {
    if (repo.nameWithOwner) {
      const owner = getOwner(repo.nameWithOwner);
      if (owner) bump(owners, owner);
    }
    const seenHosts = new Set<string>();
    for (const remote of repo.remotes) {
      if (remote.host && !seenHosts.has(remote.host)) {
        seenHosts.add(remote.host);
        bump(hosts, remote.host);
      }
      bump(remotes, remote.url);
    }
  }
  return { owners, hosts, remotes };
}

function matchesStatus(repo: LocalRepo, status: LocalRepoFilters["status"]): boolean {
  if (status === "dirty") return repo.dirty;
  if (status === "clean") return !repo.dirty;
  return true;
}

function matchesQuery(repo: LocalRepo, query: string): boolean {
  if (!query) return true;
  const haystack = [
    repo.name,
    repo.path,
    repo.nameWithOwner ?? "",
    ...repo.remotes.map((r) => r.url),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function matchesOwners(repo: LocalRepo, owners: Set<string>): boolean {
  if (!owners.size) return true;
  const owner = repo.nameWithOwner ? getOwner(repo.nameWithOwner) : null;
  return owner != null && owners.has(owner);
}

/** Apply the Local-tab filters. Multi-valued facets (host/remote) match on ANY. */
export function filterLocalRepos(repos: LocalRepo[], f: LocalRepoFilters): LocalRepo[] {
  const query = f.search.trim().toLowerCase();
  return repos.filter(
    (repo) =>
      matchesStatus(repo, f.status) &&
      matchesOwners(repo, f.owners) &&
      (!f.hosts.size || repo.remotes.some((r) => r.host && f.hosts.has(r.host))) &&
      (!f.remotes.size || repo.remotes.some((r) => f.remotes.has(r.url))) &&
      matchesQuery(repo, query),
  );
}

/** Sort keys offered in the Local-tab sort dropdown, in menu order. */
export type LocalSort =
  | "committed_desc"
  | "committed_asc"
  | "name_asc"
  | "owner_asc"
  | "stars_desc"
  | "dirty_first"
  | "status_asc";

export const DEFAULT_LOCAL_SORT: LocalSort = "committed_desc";

/**
 * One row in the flat Local list: a single checkout, or a primary checkout plus
 * its linked worktrees (`worktrees` non-empty). Worktrees ride along with their
 * primary instead of sorting independently, so the cluster stays intact.
 */
export interface LocalUnit {
  /** `gitCommonDir ?? primary.path` — stable identity shared across the cluster. */
  key: string;
  /** Representative checkout (a real primary if scanned, else the first member). */
  primary: LocalRepo;
  /** Additional checkouts (linked worktrees) rendered after the primary; [] when standalone. */
  worktrees: LocalRepo[];
}

const STATUS_ORDER: Record<LocalRepo["enrichmentStatus"], number> = {
  enriched: 0,
  unreachable: 1,
  "local-only": 2,
  "no-remote": 3,
};

function ownerOf(repo: LocalRepo): string {
  return repo.nameWithOwner ? getOwner(repo.nameWithOwner) : "";
}

/** Stable, deterministic tiebreak so equal sort keys never reorder between renders. */
function tiebreak(a: LocalRepo, b: LocalRepo): number {
  return a.path.localeCompare(b.path);
}

function compareUnits(a: LocalUnit, b: LocalUnit, sort: LocalSort): number {
  const x = a.primary;
  const y = b.primary;
  // ISO-8601 commit dates compare correctly lexically; "" (no commit) sorts last in desc / first in asc.
  const xDate = x.lastCommit?.date ?? "";
  const yDate = y.lastCommit?.date ?? "";
  switch (sort) {
    case "committed_asc":
      return xDate.localeCompare(yDate) || tiebreak(x, y);
    case "name_asc":
      return x.name.localeCompare(y.name) || tiebreak(x, y);
    case "owner_asc":
      return ownerOf(x).localeCompare(ownerOf(y)) || x.name.localeCompare(y.name) || tiebreak(x, y);
    case "stars_desc":
      return (
        (y.enrichment?.stargazerCount ?? -1) - (x.enrichment?.stargazerCount ?? -1) ||
        tiebreak(x, y)
      );
    case "dirty_first":
      return Number(y.dirty) - Number(x.dirty) || yDate.localeCompare(xDate) || tiebreak(x, y);
    case "status_asc":
      return (
        STATUS_ORDER[x.enrichmentStatus] - STATUS_ORDER[y.enrichmentStatus] ||
        x.name.localeCompare(y.name) ||
        tiebreak(x, y)
      );
    default: // committed_desc
      return yDate.localeCompare(xDate) || tiebreak(x, y);
  }
}

/**
 * Group checkouts into worktree clusters, then sort the resulting units. Sorting
 * operates on whole units (keyed by the primary) so a cluster's worktrees always
 * render adjacent to it regardless of their own commit dates / names.
 */
export function arrangeLocalRepos(repos: LocalRepo[], sort: LocalSort): LocalUnit[] {
  const byKey = new Map<string, LocalRepo[]>();
  const order: string[] = [];
  for (const repo of repos) {
    const key = repo.gitCommonDir ?? repo.path;
    if (!byKey.has(key)) {
      byKey.set(key, []);
      order.push(key);
    }
    byKey.get(key)?.push(repo);
  }
  const units: LocalUnit[] = [];
  for (const key of order) {
    const members = byKey.get(key) ?? [];
    // Prefer a real primary; fall back to the first member for an orphaned worktree
    // whose primary lives outside the scan roots.
    const primary = members.find((m) => !m.isWorktree) ?? members[0];
    if (!primary) continue;
    units.push({ key, primary, worktrees: members.filter((m) => m !== primary) });
  }
  return units.sort((a, b) => compareUnits(a, b, sort));
}
