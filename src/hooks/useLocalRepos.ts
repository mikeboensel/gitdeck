import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deleteLocalRepo as apiDeleteLocalRepo,
  fetchLocalRepoSizes,
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
  // Raw scan result. Consumers get `localRepos` below — the same list with the
  // latest measured disk sizes overlaid.
  const [scannedRepos, setScannedRepos] = useState<LocalRepo[]>([]);
  const [localScannedAt, setLocalScannedAt] = useState<string | null>(null);
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState("");
  const [localConfig, setLocalConfig] = useState<LocalReposConfig | null>(null);
  // Lowercased nameWithOwner → on-disk clone paths; drives the Repos-tab badge.
  const [localClonesByRepo, setLocalClonesByRepo] = useState<Map<string, string[]>>(new Map());
  // -1 = not yet scanned (uncertain); a real count once the scan resolves.
  const [localReposCount, setLocalReposCount] = useState(-1);
  // Absolute repo path → on-disk size (bytes), measured lazily by the server's
  // TTL-gated size cache. Overlaid onto the scan result (see `localRepos` below)
  // so badges/sort/disk-view see fresh sizes without the scan having to block on
  // `du`. `null` = unmeasurable.
  const [localSizes, setLocalSizes] = useState<Record<string, number | null>>({});
  const localReposFetchedRef = useRef(false);

  // Ask the server for up-to-date disk sizes (re-measures only repos past the TTL).
  // Fire-and-forget after a scan, so the scan returns fast and sizes fill in after.
  const refreshLocalSizes = useCallback(() => {
    fetchLocalRepoSizes()
      .then(({ sizes }) => setLocalSizes((prev) => ({ ...prev, ...sizes })))
      .catch(() => {});
  }, []);

  // Apply a fresh local-repo dataset: store the repos + scan time, and derive
  // the clone-count map (lowercased nameWithOwner → on-disk paths) used by the
  // Repos-tab clone badge. Local data is disk state, not account-scoped.
  const applyLocalRepos = useCallback((data: LocalReposData) => {
    setScannedRepos(data.repos);
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
        .then((data) => {
          applyLocalRepos(data);
          // Sizes were skipped by the fast scan — pull them in separately.
          refreshLocalSizes();
        })
        .catch((err: unknown) => setLocalError(err instanceof Error ? err.message : String(err)))
        .finally(() => setLocalLoading(false));
    },
    [applyLocalRepos, refreshLocalSizes],
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
      setScannedRepos((prev) => prev.filter((r) => r.path !== path));
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
      setScannedRepos((prev) => {
        snapshot = prev;
        return prev.filter((r) => !drop.has(r.path));
      });
      try {
        await apiDeleteLocalRepo(path, force);
      } catch (err) {
        setScannedRepos(snapshot);
        setLocalError(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    [],
  );

  // Overlay the latest measured sizes onto the scanned repos. The scan attaches
  // whatever the size cache held at build time; this keeps the displayed size in
  // sync with a post-scan refresh without re-fetching the whole dataset.
  const localRepos = useMemo(() => {
    if (Object.keys(localSizes).length === 0) return scannedRepos;
    return scannedRepos.map((repo) =>
      repo.path in localSizes ? { ...repo, sizeBytes: localSizes[repo.path] ?? null } : repo,
    );
  }, [scannedRepos, localSizes]);

  return {
    localRepos,
    localScannedAt,
    localLoading,
    localError,
    localConfig,
    localClonesByRepo,
    localReposCount,
    reloadLocalRepos,
    refreshLocalSizes,
    saveLocalConfig,
    hideLocalRepo,
    unhideLocalRepo,
    deleteLocalRepo,
  };
}
