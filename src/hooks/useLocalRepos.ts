import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteLocalRepo as apiDeleteLocalRepo,
  fetchLocalRepos,
  fetchLocalReposConfig,
  updateLocalReposConfig,
} from "../api/github";
import type { Tab } from "../appHelpers";
import type { LocalRepo, LocalReposConfig, LocalReposData } from "../types/github";

interface UseLocalReposOptions {
  /** Only scan while authenticated. */
  authenticated: boolean;
  /** Current tab — scanning is deferred until the Repos or Local tab is opened. */
  tab: Tab;
}

/**
 * Owns the local-repo dataset (disk state, not account-scoped) and its
 * mutations: lazy first scan, rescan, scan-config edits, hide/unhide triage, and
 * move-to-Trash. Also derives the clone-count map and repo count the Repos tab
 * badge consumes. Filtering and facet construction stay in the caller, which
 * owns the (persisted) local filter state.
 */
export function useLocalRepos({ authenticated, tab }: UseLocalReposOptions) {
  const [localRepos, setLocalRepos] = useState<LocalRepo[]>([]);
  const [localScannedAt, setLocalScannedAt] = useState<string | null>(null);
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState("");
  const [localConfig, setLocalConfig] = useState<LocalReposConfig | null>(null);
  // Lowercased nameWithOwner → on-disk clone paths; drives the Repos-tab badge.
  const [localClonesByRepo, setLocalClonesByRepo] = useState<Map<string, string[]>>(new Map());
  // -1 = not yet scanned (uncertain); a real count once the scan resolves.
  const [localReposCount, setLocalReposCount] = useState(-1);
  const localReposFetchedRef = useRef(false);

  // Apply a fresh local-repo dataset: store the repos + scan time, and derive
  // the clone-count map (lowercased nameWithOwner → on-disk paths) used by the
  // Repos-tab clone badge. Local data is disk state, not account-scoped.
  const applyLocalRepos = useCallback((data: LocalReposData) => {
    setLocalRepos(data.repos);
    setLocalScannedAt(data.scannedAt);
    const map = new Map<string, string[]>();
    for (const local of data.repos) {
      if (!local.nameWithOwner) continue;
      const key = local.nameWithOwner.toLowerCase();
      const paths = map.get(key) ?? [];
      paths.push(local.path);
      map.set(key, paths);
    }
    setLocalClonesByRepo(map);
    setLocalReposCount(data.repos.length);
  }, []);

  const reloadLocalRepos = useCallback(
    (fresh: boolean) => {
      setLocalLoading(true);
      setLocalError("");
      fetchLocalRepos(fresh)
        .then(applyLocalRepos)
        .catch((err: unknown) => setLocalError(err instanceof Error ? err.message : String(err)))
        .finally(() => setLocalLoading(false));
    },
    [applyLocalRepos],
  );

  // Scan once when the Repos or Local tab is first opened (the disk walk is
  // expensive — explicit Rescan / config changes drive freshness afterwards).
  useEffect(() => {
    if (!authenticated) return;
    if (tab !== "repos" && tab !== "local") return;
    if (localReposFetchedRef.current) return;
    localReposFetchedRef.current = true;
    reloadLocalRepos(false);
    fetchLocalReposConfig()
      .then(({ config }) => setLocalConfig(config))
      .catch(() => {});
  }, [tab, authenticated, reloadLocalRepos]);

  // Persist a scan-config change (roots/excludes), then rescan to reflect it.
  const saveLocalConfig = useCallback(
    (updates: Partial<LocalReposConfig>) => {
      updateLocalReposConfig(updates)
        .then(({ config }) => {
          setLocalConfig(config);
          reloadLocalRepos(true);
        })
        .catch((err: unknown) => setLocalError(err instanceof Error ? err.message : String(err)));
    },
    [reloadLocalRepos],
  );

  // Triage: add a repo path to the denylist (optimistically drop it from view).
  const hideLocalRepo = useCallback(
    (path: string) => {
      setLocalRepos((prev) => prev.filter((r) => r.path !== path));
      const denylist = [...(localConfig?.denylist ?? []), path];
      updateLocalReposConfig({ denylist })
        .then(({ config }) => setLocalConfig(config))
        .catch((err: unknown) => setLocalError(err instanceof Error ? err.message : String(err)));
    },
    [localConfig],
  );

  // Un-triage: drop a path from the denylist, then rescan so it reappears.
  const unhideLocalRepo = useCallback(
    (path: string) => {
      const denylist = (localConfig?.denylist ?? []).filter((p) => p !== path);
      updateLocalReposConfig({ denylist })
        .then(({ config }) => {
          setLocalConfig(config);
          reloadLocalRepos(true);
        })
        .catch((err: unknown) => setLocalError(err instanceof Error ? err.message : String(err)));
    },
    [localConfig, reloadLocalRepos],
  );

  // Move a local repo to the Trash. The caller (disk-usage view) confirms first;
  // we optimistically drop the whole worktree cluster, rolling back on failure.
  // Re-throws so the caller can surface its own feedback. `force` deletes an
  // unsafe repo (server re-validates regardless).
  const deleteLocalRepo = useCallback(
    async (path: string, memberPaths: string[], force: boolean) => {
      const drop = new Set(memberPaths.length ? memberPaths : [path]);
      let snapshot: LocalRepo[] = [];
      setLocalRepos((prev) => {
        snapshot = prev;
        return prev.filter((r) => !drop.has(r.path));
      });
      try {
        await apiDeleteLocalRepo(path, force);
      } catch (err) {
        setLocalRepos(snapshot);
        setLocalError(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    [],
  );

  return {
    localRepos,
    localScannedAt,
    localLoading,
    localError,
    localConfig,
    localClonesByRepo,
    localReposCount,
    reloadLocalRepos,
    saveLocalConfig,
    hideLocalRepo,
    unhideLocalRepo,
    deleteLocalRepo,
  };
}
