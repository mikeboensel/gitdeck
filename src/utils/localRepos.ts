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
