import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuBuilding2, LuGitBranch, LuServer } from "react-icons/lu";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { invalidate as invalidateCache, peek, swr } from "./api/cache";
import {
  AuthRequiredClientError,
  fetchAuthStatus,
  fetchCIHealth,
  fetchCollaborators,
  fetchDailyDigests,
  fetchIssues,
  fetchLocalRepos,
  fetchLocalReposConfig,
  fetchNotifications,
  fetchPullRequests,
  fetchRepoInsights,
  fetchRepos,
  logoutAuth,
  markAllNotificationsRead,
  markNotificationRead,
  updateLocalReposConfig,
} from "./api/github";
import {
  CACHE_KEY,
  defaultIssueFilters,
  defaultPrFilters,
  defaultRepoFilters,
  detailTabFromParams,
  downloadJson,
  metricKindFromParams,
  TAB_ROUTES,
  type Tab,
  tabFromPath,
} from "./appHelpers";
import { AuthGate } from "./components/AuthGate";
import { Avatar } from "./components/common/Avatar";
import {
  BarChartIcon,
  BoardIcon,
  BookIcon,
  CalendarIcon,
  FolderIcon,
  InboxIcon,
  IssueIcon,
  PullRequestIcon,
  PulseIcon,
  ShieldIcon,
} from "./components/common/Icons";
import { Pagination } from "./components/common/Pagination";
import { type SortOption, SortSelect } from "./components/common/SortSelect";
import { Footer } from "./components/Footer";
import { ChangelogModal } from "./components/modals/ChangelogModal";
import { CommandPalette } from "./components/modals/CommandPalette";
import { ContributorsModal } from "./components/modals/ContributorsModal";
import { type DetailTab, RepositoryDetailsModal } from "./components/modals/RepositoryDetailsModal";
import { type MetricKind, RepositoryMetricModal } from "./components/modals/RepositoryMetricModal";
import { WelcomeModal } from "./components/modals/WelcomeModal";
import { type InboxSidebarState, SidebarControls } from "./components/SidebarControls";
import { type FacetGroup, FacetSidebar } from "./components/sidebar/FacetSidebar";
import { FilterSection, toggleSetValue } from "./components/sidebar/primitives";
import { TopBar } from "./components/TopBar";
import { CIHealthView } from "./components/views/CIHealthView";
import { DailyDigestView } from "./components/views/DailyDigestView";
import { InboxView } from "./components/views/InboxView";
import { InsightsView } from "./components/views/InsightsView";
import { IssueList } from "./components/views/IssueList";
import { KanbanView } from "./components/views/KanbanView";
import { LocalReposView } from "./components/views/LocalReposView";
import { PullRequestList } from "./components/views/PullRequestList";
import {
  REPO_DENSITY_OPTIONS,
  type RepoDensity,
  type RepoLayout,
  ReposView,
} from "./components/views/ReposView";
import { RepoViewControls } from "./components/views/RepoViewControls";
import { useAccounts, useCapability } from "./contexts/AccountContext";
import { useI18n } from "./i18n/I18nProvider";
import type {
  CIHealthData,
  DailyDigestEntry,
  DailyDigestsData,
  DigestPeriod,
  GhIssue,
  GhNotification,
  GhPullRequest,
  GhRepo,
  IssuesData,
  LocalRepo,
  LocalReposConfig,
  LocalReposData,
  PullRequestsData,
  RepoCIHealth,
  RepoInsight,
  RepoInsightsData,
  ReposData,
} from "./types/github";
import {
  type CachedCollaborators,
  clearCollaboratorsCache,
  readCollaboratorsCache,
  writeCollaboratorsCache,
} from "./utils/collaboratorsCache";
import {
  buildIssueFacets,
  buildPullRequestFacets,
  buildRepoFacets,
  filterIssues,
  filterPullRequests,
  filterRepos,
  type IssueFilters,
  type PullRequestFilters,
  type RepoFilters,
  sortIssues,
  sortPullRequests,
  sortRepos,
} from "./utils/dashboard";
import { errorMessage } from "./utils/errors";
import {
  clearFiltersCache,
  hydrateFilters,
  readFiltersCache,
  writeFiltersCache,
} from "./utils/filtersCache";
import { formatNumber } from "./utils/format";
import {
  buildInboxItems,
  INBOX_MAILBOXES,
  type InboxMailbox,
  matchesInboxMailbox,
  mergeNotifications,
} from "./utils/inbox";
import {
  buildLocalFacets,
  DEFAULT_LOCAL_SORT,
  defaultLocalFilters,
  filterLocalRepos,
  type LocalRepoFilters,
  type LocalSort,
  shortRemote,
} from "./utils/localRepos";
import { clampPage } from "./utils/pagination";
import { clearStatsCache, readStatsCache, writeStatsCache } from "./utils/statsCache";

const ISSUE_SORT_OPTIONS: SortOption[] = [
  { value: "updated_desc", label: "sort.recentlyUpdated" },
  { value: "updated_asc", label: "sort.leastRecentlyUpdated" },
  { value: "created_desc", label: "sort.newest" },
  { value: "created_asc", label: "sort.oldest" },
  { value: "comments_desc", label: "sort.mostCommented" },
  { value: "comments_asc", label: "sort.leastCommented" },
  { value: "repo_asc", label: "sort.repositoryAZ" },
];

const PR_SORT_OPTIONS: SortOption[] = [
  { value: "updated_desc", label: "sort.recentlyUpdated" },
  { value: "updated_asc", label: "sort.leastRecentlyUpdated" },
  { value: "created_desc", label: "sort.newest" },
  { value: "created_asc", label: "sort.oldest" },
  { value: "review_pending", label: "sort.awaitingReviewFirst" },
  { value: "size_desc", label: "sort.largestDiff" },
  { value: "size_asc", label: "sort.smallestDiff" },
  { value: "files_desc", label: "sort.mostFilesChanged" },
  { value: "comments_desc", label: "sort.mostCommented" },
  { value: "repo_asc", label: "sort.repositoryAZ" },
];

const REPO_SORT_OPTIONS: SortOption[] = [
  { value: "stars_desc", label: "sort.mostStars" },
  { value: "stars_asc", label: "sort.fewestStars" },
  { value: "forks_desc", label: "sort.mostForks" },
  { value: "forks_asc", label: "sort.fewestForks" },
  { value: "issues_desc", label: "sort.mostOpenIssues" },
  { value: "issues_asc", label: "sort.fewestOpenIssues" },
  { value: "pushed_desc", label: "sort.recentlyPushed" },
  { value: "updated_desc", label: "sort.recentlyUpdated" },
  { value: "name_asc", label: "sort.nameAZ" },
];

type Theme = "dark" | "light" | "auto";
type TextSize = "small" | "normal" | "large";

type AuthState = "checking" | "anonymous" | "authenticated";

export function App() {
  const { t } = useI18n();
  const projectsEnabled = useCapability("projects");
  const { active: activeAccount } = useAccounts();
  const activeAccountId = activeAccount?.id ?? null;
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = tabFromPath(location.pathname);
  const routeRepoName = searchParams.get("repo") || "";
  const repoDetailTab = detailTabFromParams(searchParams);
  const routeMetricKind = metricKindFromParams(searchParams);

  // Read cached filters once — shared across all filter/sort useState initializers below.
  const [cachedFiltersOnMount] = useState(() => {
    const raw = readFiltersCache();
    return raw ? { hydrated: hydrateFilters(raw), sorts: raw.sorts } : null;
  });

  const [authState, setAuthState] = useState<AuthState>("checking");
  const [authLogin, setAuthLogin] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"device" | "gh-cli" | "token">("device");
  const [issues, setIssues] = useState<GhIssue[]>([]);
  const [pullRequests, setPullRequests] = useState<GhPullRequest[]>([]);
  const [repos, setRepos] = useState<GhRepo[]>([]);
  const [owners, setOwners] = useState<string[]>([]);
  const [repoInsights, setRepoInsights] = useState<RepoInsight[]>([]);
  // Repo→collaborator-logins map, hydrated from localStorage for instant render.
  const [collaboratorsByRepo, setCollaboratorsByRepo] = useState<Map<string, string[]>>(() => {
    const cached = readCollaboratorsCache();
    return cached ? new Map(Object.entries(cached.byRepo)) : new Map();
  });
  const [collaboratorsFetchedAt, setCollaboratorsFetchedAt] = useState<string | null>(
    () => readCollaboratorsCache()?.fetchedAt ?? null,
  );
  const [collaboratorsLoading, setCollaboratorsLoading] = useState(false);
  // Repo nameWithOwner (lowercased) → local clone paths on disk. Drives the
  // clone-count badge on repo cards; not account-scoped (clones live on disk).
  const [localClonesByRepo, setLocalClonesByRepo] = useState<Map<string, string[]>>(new Map());
  // -1 = not yet scanned (uncertain); a real count once the scan resolves.
  const [localReposCount, setLocalReposCount] = useState(-1);
  const localReposFetchedRef = useRef(false);
  // Full local-repo dataset + scan/config/filter state for the Local tab. App
  // owns it (like GitHub repos) so the FacetSidebar and the view share one fetch.
  const [localRepos, setLocalRepos] = useState<LocalRepo[]>([]);
  const [localScannedAt, setLocalScannedAt] = useState<string | null>(null);
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState("");
  const [localConfig, setLocalConfig] = useState<LocalReposConfig | null>(null);
  const [localFilters, setLocalFilters] = useState<LocalRepoFilters>(
    () => cachedFiltersOnMount?.hydrated.localFilters ?? defaultLocalFilters(),
  );
  const [localSort, setLocalSort] = useState<LocalSort>(
    () => (cachedFiltersOnMount?.sorts?.localSort as LocalSort | undefined) ?? DEFAULT_LOCAL_SORT,
  );
  const [dailyDigests, setDailyDigests] = useState<DailyDigestEntry[]>([]);
  const [digestPeriod, setDigestPeriod] = useState<DigestPeriod>(
    () => (localStorage.getItem("gh-dash.digestPeriod") as DigestPeriod) || "day",
  );
  const [ciHealth, setCiHealth] = useState<RepoCIHealth[]>([]);
  const [fetchedAt, setFetchedAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [dataStale, setDataStale] = useState(false);
  const [error, setError] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [contributorsOpen, setContributorsOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(
    () => !localStorage.getItem("gh-dash.welcomeSeen"),
  );
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notifications, setNotifications] = useState<GhNotification[]>([]);
  const [pollInterval, setPollInterval] = useState(60);
  const [mailbox, setMailbox] = useState<InboxMailbox>("inbox");
  const [inboxPage, setInboxPage] = useState(1);
  const [inboxPageSize, setInboxPageSize] = useState(
    Number(localStorage.getItem("gh-dash.inboxPageSize")) || 20,
  );
  const [inboxSearch, setInboxSearch] = useState("");
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("gh-dash.theme") as Theme) || "dark",
  );
  const [textSize, setTextSize] = useState<TextSize>(
    () => (localStorage.getItem("gh-dash.textSize") as TextSize) || "normal",
  );
  const [issueFilters, setIssueFilters] = useState<IssueFilters>(
    () => cachedFiltersOnMount?.hydrated.issueFilters ?? defaultIssueFilters(),
  );
  const [prFilters, setPrFilters] = useState<PullRequestFilters>(
    () => cachedFiltersOnMount?.hydrated.prFilters ?? defaultPrFilters(),
  );
  const [repoFilters, setRepoFilters] = useState<RepoFilters>(
    () => cachedFiltersOnMount?.hydrated.repoFilters ?? defaultRepoFilters(),
  );
  const [issueSort, setIssueSort] = useState(
    () => cachedFiltersOnMount?.sorts?.issueSort || "updated_desc",
  );
  const [prSort, setPrSort] = useState(() => cachedFiltersOnMount?.sorts?.prSort || "updated_desc");
  const [repoSort, setRepoSort] = useState(
    () => cachedFiltersOnMount?.sorts?.repoSort || "stars_desc",
  );
  // Page numbers are intentionally NOT cached — they're ephemeral positions,
  // not preferences. After a refresh, page 1 is always the correct start.
  const [issuePage, setIssuePage] = useState(1);
  const [prPage, setPrPage] = useState(1);
  const [repoPage, setRepoPage] = useState(1);
  const [issuePageSize, setIssuePageSize] = useState(
    Number(localStorage.getItem("gh-dash.issuesPageSize")) || 20,
  );
  const [prPageSize, setPrPageSize] = useState(
    Number(localStorage.getItem("gh-dash.prsPageSize")) || 20,
  );
  const [repoPageSize, setRepoPageSize] = useState(
    Number(localStorage.getItem("gh-dash.reposPageSize")) || 20,
  );
  const [repoLayout, setRepoLayout] = useState<RepoLayout>(
    () => (localStorage.getItem("gh-dash.repoLayout") as RepoLayout) || "grid",
  );
  const [repoDensity, setRepoDensity] = useState<RepoDensity>(
    () => (localStorage.getItem("gh-dash.repoDensity") as RepoDensity) || "cozy",
  );
  // Local tab keeps its own layout/density so toggling one tab never moves the other.
  const [localLayout, setLocalLayout] = useState<RepoLayout>(
    () => (localStorage.getItem("gh-dash.localLayout") as RepoLayout) || "grid",
  );
  const [localDensity, setLocalDensity] = useState<RepoDensity>(
    () => (localStorage.getItem("gh-dash.localDensity") as RepoDensity) || "cozy",
  );
  const abortRef = useRef<AbortController | null>(null);
  const initialLoadRef = useRef(false);

  const loadData = useCallback((fresh = false) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError("");
    setDataStale(true);

    const cachedRepos = peek<ReposData>(CACHE_KEY.repos);
    if (cachedRepos) {
      setRepos(cachedRepos.repos);
      setOwners(cachedRepos.owners);
      setFetchedAt(cachedRepos.fetchedAt);
    }
    const cachedIssues = peek<IssuesData>(CACHE_KEY.issues);
    if (cachedIssues) setIssues(cachedIssues.issues);
    const cachedPrs = peek<PullRequestsData>(CACHE_KEY.prs);
    if (cachedPrs) setPullRequests(cachedPrs.pullRequests);

    // Fall back to localStorage when in-memory cache is empty (page refresh)
    if (!cachedRepos && !cachedIssues && !cachedPrs) {
      const persisted = readStatsCache();
      if (persisted) {
        setRepos(persisted.repos as GhRepo[]);
        setOwners(persisted.owners);
        setIssues(persisted.issues as GhIssue[]);
        setPullRequests(persisted.pullRequests as GhPullRequest[]);
        if (persisted.fetchedAt) setFetchedAt(persisted.fetchedAt);
      }
    }

    let pending = 3;
    setLoading(true);
    const finish = () => {
      pending -= 1;
      if (pending <= 0 && abortRef.current === controller) {
        setLoading(false);
        setDataStale(false);
      }
    };
    const handleFailure = (err: unknown) => {
      if (controller.signal.aborted) return;
      if (err instanceof AuthRequiredClientError) {
        setAuthState("anonymous");
        setAuthLogin(null);
        return;
      }
      if (err instanceof Error && err.name === "AbortError") return;
      setError(errorMessage(err));
    };

    void swr<ReposData>(CACHE_KEY.repos, (signal) => fetchRepos(fresh, signal), {
      fresh,
      signal: controller.signal,
    })
      .promise.then((data) => {
        if (controller.signal.aborted) return;
        setRepos(data.repos);
        setOwners(data.owners);
        setFetchedAt(data.fetchedAt);
      }, handleFailure)
      .finally(finish);

    void swr<IssuesData>(CACHE_KEY.issues, (signal) => fetchIssues(fresh, signal), {
      fresh,
      signal: controller.signal,
    })
      .promise.then((data) => {
        if (controller.signal.aborted) return;
        setIssues(data.issues);
      }, handleFailure)
      .finally(finish);

    void swr<PullRequestsData>(CACHE_KEY.prs, (signal) => fetchPullRequests(fresh, signal), {
      fresh,
      signal: controller.signal,
    })
      .promise.then((data) => {
        if (controller.signal.aborted) return;
        setPullRequests(data.pullRequests);
      }, handleFailure)
      .finally(finish);
  }, []);

  useEffect(() => {
    void fetchAuthStatus()
      .then((status) => {
        setAuthMode(status.mode);
        if (status.authenticated) {
          setAuthLogin(status.login);
          setAuthState("authenticated");
        } else {
          setAuthState("anonymous");
        }
      })
      .catch(() => setAuthState("anonymous"));
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: activeAccountId is an intentional re-run trigger so data is reset and refetched when the active account changes
  useEffect(() => {
    if (authState !== "authenticated") {
      initialLoadRef.current = false;
      return;
    }
    if (!initialLoadRef.current) {
      initialLoadRef.current = true;
      loadData();
      return;
    }
    setIssues([]);
    setPullRequests([]);
    setRepos([]);
    setOwners([]);
    setRepoInsights([]);
    setDailyDigests([]);
    setCiHealth([]);
    setCollaboratorsByRepo(new Map());
    setCollaboratorsFetchedAt(null);
    setNotifications([]);
    setFetchedAt("");
    clearStatsCache();
    clearCollaboratorsCache();
    loadData(true);
  }, [authState, activeAccountId, loadData]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Persist dashboard data to localStorage for instant display on next page load
  useEffect(() => {
    if (repos.length === 0 && issues.length === 0 && pullRequests.length === 0) return;
    writeStatsCache({
      repos,
      owners,
      issues,
      pullRequests,
      fetchedAt,
    });
  }, [repos, owners, issues, pullRequests, fetchedAt]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: activeAccountId is an intentional re-run trigger so account-scoped insights are refetched when the active account changes
  useEffect(() => {
    if (authState !== "authenticated") return;
    if (tab !== "insights" && tab !== "alerts" && tab !== "repos") return;
    const cached = peek<RepoInsightsData>(CACHE_KEY.insights);
    if (cached) setRepoInsights(cached.insights);
    const controller = new AbortController();
    swr<RepoInsightsData>(CACHE_KEY.insights, (signal) => fetchRepoInsights(false, signal), {
      signal: controller.signal,
    })
      .promise.then((data) => {
        if (!controller.signal.aborted) setRepoInsights(data.insights);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [tab, authState, activeAccountId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: activeAccountId is an intentional re-run trigger so account-scoped CI health is refetched when the active account changes
  useEffect(() => {
    if (authState !== "authenticated") return;
    if (tab !== "ci") return;
    const cached = peek<CIHealthData>(CACHE_KEY.ciHealth);
    if (cached) setCiHealth(cached.repos);
    const controller = new AbortController();
    swr<CIHealthData>(CACHE_KEY.ciHealth, (signal) => fetchCIHealth(false, signal), {
      signal: controller.signal,
    })
      .promise.then((data) => {
        if (!controller.signal.aborted) setCiHealth(data.repos);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [tab, authState, activeAccountId]);

  const applyCollaborators = useCallback((data: CachedCollaborators) => {
    setCollaboratorsByRepo(new Map(Object.entries(data.byRepo)));
    setCollaboratorsFetchedAt(data.fetchedAt);
    writeCollaboratorsCache({ byRepo: data.byRepo, fetchedAt: data.fetchedAt });
  }, []);

  // Collaborators are expensive to fetch, so unlike other data we DON'T revalidate
  // on every tab visit — we render the localStorage copy and only auto-fetch when
  // nothing is cached. Explicit refresh (below) is the way to get fresh data.
  // biome-ignore lint/correctness/useExhaustiveDependencies: activeAccountId is an intentional re-run trigger so account-scoped collaborators are refetched when the active account changes
  useEffect(() => {
    if (authState !== "authenticated") return;
    if (tab !== "repos") return;
    if (collaboratorsFetchedAt) return;
    const controller = new AbortController();
    setCollaboratorsLoading(true);
    fetchCollaborators(false, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) applyCollaborators(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setCollaboratorsLoading(false);
      });
    return () => controller.abort();
  }, [tab, authState, activeAccountId, collaboratorsFetchedAt, applyCollaborators]);

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
    if (authState !== "authenticated") return;
    if (tab !== "repos" && tab !== "local") return;
    if (localReposFetchedRef.current) return;
    localReposFetchedRef.current = true;
    reloadLocalRepos(false);
    fetchLocalReposConfig()
      .then(({ config }) => setLocalConfig(config))
      .catch(() => {});
  }, [tab, authState, reloadLocalRepos]);

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

  const refreshCollaborators = useCallback(() => {
    setCollaboratorsLoading(true);
    fetchCollaborators(true)
      .then(applyCollaborators)
      .catch(() => {})
      .finally(() => setCollaboratorsLoading(false));
  }, [applyCollaborators]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: activeAccountId is an intentional re-run trigger so account-scoped digests are refetched when the active account changes
  useEffect(() => {
    if (authState !== "authenticated") return;
    if (tab !== "digests") return;
    const cacheKey =
      digestPeriod === "day" ? CACHE_KEY.digests : `${CACHE_KEY.digests}?period=${digestPeriod}`;
    const cached = peek<DailyDigestsData>(cacheKey);
    if (cached) setDailyDigests(cached.digests);
    const controller = new AbortController();
    swr<DailyDigestsData>(cacheKey, (signal) => fetchDailyDigests(signal, digestPeriod), {
      signal: controller.signal,
    })
      .promise.then((data) => {
        if (!controller.signal.aborted) setDailyDigests(data.digests);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [tab, authState, digestPeriod, activeAccountId]);

  useEffect(() => {
    localStorage.setItem("gh-dash.digestPeriod", digestPeriod);
  }, [digestPeriod]);

  async function handleLogout() {
    abortRef.current?.abort();
    try {
      await logoutAuth();
    } catch {
      // ignore — UI flips regardless
    }
    invalidateCache();
    clearStatsCache();
    clearCollaboratorsCache();
    clearFiltersCache();
    setAuthState("anonymous");
    setAuthLogin(null);
    setIssues([]);
    setPullRequests([]);
    setRepos([]);
    setOwners([]);
    setRepoInsights([]);
    setDailyDigests([]);
    setCiHealth([]);
    setCollaboratorsByRepo(new Map());
    setCollaboratorsFetchedAt(null);
    setFetchedAt("");
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("gh-dash.theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.textSize = textSize;
    localStorage.setItem("gh-dash.textSize", textSize);
  }, [textSize]);

  useEffect(() => {
    document.body.classList.toggle("tab-inbox", tab === "inbox");
    document.body.classList.toggle("tab-issues", tab === "issues");
    document.body.classList.toggle("tab-prs", tab === "prs");
    document.body.classList.toggle("tab-repos", tab === "repos");
    document.body.classList.toggle("tab-local", tab === "local");
    document.body.classList.toggle("tab-kanban", tab === "kanban");
    document.body.classList.toggle("tab-insights", tab === "insights");
    document.body.classList.toggle("tab-alerts", tab === "alerts");
    document.body.classList.toggle("tab-ci", tab === "ci");
    document.body.classList.toggle("tab-digests", tab === "digests");
    document.body.classList.toggle("filters-open", filtersOpen);
  }, [tab, filtersOpen]);

  useEffect(() => {
    if (location.pathname === "/" || location.pathname === "/index.html") {
      navigate(`${TAB_ROUTES.repos}${location.search}`, { replace: true });
      return;
    }
    if (location.pathname === "/alert") {
      navigate(`${TAB_ROUTES.alerts}${location.search}`, { replace: true });
    }
  }, [location.pathname, location.search, navigate]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: location.pathname is an intentional re-run trigger so the filters panel closes on every route change
  useEffect(() => setFiltersOpen(false), [location.pathname]);

  useEffect(() => {
    function handler(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Escape closes the topmost open overlay. Modals can stack (e.g. the command
  // palette opens via ⌘K over a repo modal), so close only the frontmost one in
  // priority order rather than all at once.
  useEffect(() => {
    function handler(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // routeRepoName covers both the repo-detail and metric modals (searchParams
      // driven); both dismiss by navigating back to the current tab route.
      if (paletteOpen) setPaletteOpen(false);
      else if (routeRepoName) navigate(TAB_ROUTES[tab]);
      else if (changelogOpen) setChangelogOpen(false);
      else if (contributorsOpen) setContributorsOpen(false);
      else if (welcomeOpen) setWelcomeOpen(false);
      else if (filtersOpen) setFiltersOpen(false);
      else return;
      event.preventDefault();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    paletteOpen,
    routeRepoName,
    changelogOpen,
    contributorsOpen,
    welcomeOpen,
    filtersOpen,
    navigate,
    tab,
  ]);

  useEffect(
    () => localStorage.setItem("gh-dash.issuesPageSize", String(issuePageSize)),
    [issuePageSize],
  );
  useEffect(() => localStorage.setItem("gh-dash.prsPageSize", String(prPageSize)), [prPageSize]);
  useEffect(
    () => localStorage.setItem("gh-dash.reposPageSize", String(repoPageSize)),
    [repoPageSize],
  );
  useEffect(() => localStorage.setItem("gh-dash.repoLayout", repoLayout), [repoLayout]);
  useEffect(() => localStorage.setItem("gh-dash.repoDensity", repoDensity), [repoDensity]);
  useEffect(() => localStorage.setItem("gh-dash.localLayout", localLayout), [localLayout]);
  useEffect(() => localStorage.setItem("gh-dash.localDensity", localDensity), [localDensity]);
  const cycleDensity = useCallback(
    (set: typeof setRepoDensity) =>
      set(
        (current) =>
          REPO_DENSITY_OPTIONS[
            (REPO_DENSITY_OPTIONS.indexOf(current) + 1) % REPO_DENSITY_OPTIONS.length
          ] ?? current,
      ),
    [],
  );
  const cycleRepoDensity = useCallback(() => cycleDensity(setRepoDensity), [cycleDensity]);
  const cycleLocalDensity = useCallback(() => cycleDensity(setLocalDensity), [cycleDensity]);
  useEffect(
    () => localStorage.setItem("gh-dash.inboxPageSize", String(inboxPageSize)),
    [inboxPageSize],
  );

  const refreshNotifications = useCallback(async (fresh = false) => {
    try {
      const data = await fetchNotifications(fresh);
      setNotifications(data.notifications);
      if (data.pollInterval) setPollInterval(data.pollInterval);
    } catch {
      // silent — Inbox still works without notifications
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: activeAccountId is an intentional re-run trigger so notifications are refetched when the active account changes
  useEffect(() => {
    if (authState !== "authenticated") return;
    void refreshNotifications(true);
  }, [authState, activeAccountId, refreshNotifications]);

  useEffect(() => {
    if (authState !== "authenticated" || !pollInterval) return;
    const id = window.setInterval(() => {
      void refreshNotifications();
    }, Math.max(30, pollInterval) * 1000);
    return () => window.clearInterval(id);
  }, [authState, pollInterval, refreshNotifications]);

  const handleMarkRead = useCallback(
    async (threadId: string) => {
      setNotifications((prev) =>
        prev.map((entry) => (entry.id === threadId ? { ...entry, unread: false } : entry)),
      );
      try {
        await markNotificationRead(threadId);
      } catch {
        void refreshNotifications(true);
      }
    },
    [refreshNotifications],
  );

  const userLoginValue = owners[0] || "";
  const inboxItems = useMemo(() => {
    const base = buildInboxItems({ issues, pullRequests, userLogin: userLoginValue });
    return mergeNotifications(base, notifications);
  }, [issues, pullRequests, userLoginValue, notifications]);
  const mailboxItems = useMemo(
    () => inboxItems.filter((item) => matchesInboxMailbox(item, mailbox)),
    [inboxItems, mailbox],
  );
  const inboxCounts = useMemo(() => {
    const counts: Record<InboxMailbox, number> = {} as Record<InboxMailbox, number>;
    for (const entry of INBOX_MAILBOXES) {
      counts[entry.key] = inboxItems.filter((item) => matchesInboxMailbox(item, entry.key)).length;
    }
    return counts;
  }, [inboxItems]);
  const inboxUnreadCount = useMemo(
    () => inboxItems.filter((item) => item.unread).length,
    [inboxItems],
  );

  const handleMarkAllRead = useCallback(async () => {
    if (!inboxUnreadCount) return;
    if (
      !window.confirm(
        t("confirm.markAllRead", {
          count: inboxUnreadCount,
          plural: inboxUnreadCount === 1 ? "" : "s",
        }),
      )
    )
      return;
    const previous = notifications;
    setNotifications((prev) => prev.map((entry) => ({ ...entry, unread: false })));
    try {
      await markAllNotificationsRead();
    } catch {
      setNotifications(previous);
    }
  }, [inboxUnreadCount, notifications, t]);

  const inboxSidebar: InboxSidebarState = {
    mailbox,
    counts: inboxCounts,
    totalCount: inboxItems.length,
    unreadCount: inboxUnreadCount,
    onMailboxChange: (next) => {
      setMailbox(next);
      setInboxPage(1);
    },
    onMarkAllRead: () => void handleMarkAllRead(),
  };

  // Persist sidebar filters and sort order to localStorage
  useEffect(() => {
    writeFiltersCache(
      repoFilters,
      issueFilters,
      prFilters,
      { issueSort, prSort, repoSort, localSort },
      localFilters,
    );
  }, [repoFilters, issueFilters, prFilters, issueSort, prSort, repoSort, localSort, localFilters]);

  const userLogin = userLoginValue;
  const issueFacets = useMemo(() => buildIssueFacets(issues), [issues]);
  const prFacets = useMemo(() => buildPullRequestFacets(pullRequests), [pullRequests]);
  const repoFacets = useMemo(
    () => buildRepoFacets(repos, collaboratorsByRepo),
    [repos, collaboratorsByRepo],
  );
  const localFacets = useMemo(() => buildLocalFacets(localRepos), [localRepos]);
  const filteredLocalRepos = useMemo(
    () => filterLocalRepos(localRepos, localFilters),
    [localRepos, localFilters],
  );
  const localFacetGroups = useMemo<FacetGroup[]>(
    () => [
      {
        key: "owners",
        title: t("local.facetOwner"),
        icon: <LuBuilding2 size={16} />,
        entries: [...localFacets.owners.entries()],
        selected: localFilters.owners,
        onToggle: (v) => setLocalFilters((f) => ({ ...f, owners: toggleSetValue(f.owners, v) })),
        onClear: () => setLocalFilters((f) => ({ ...f, owners: new Set() })),
        render: "chips",
        renderIcon: (name) => <Avatar login={name} size={40} className="facet-chip-avatar" />,
        open: true,
      },
      {
        key: "hosts",
        title: t("local.facetHost"),
        icon: <LuServer size={16} />,
        entries: [...localFacets.hosts.entries()],
        selected: localFilters.hosts,
        onToggle: (v) => setLocalFilters((f) => ({ ...f, hosts: toggleSetValue(f.hosts, v) })),
        onClear: () => setLocalFilters((f) => ({ ...f, hosts: new Set() })),
      },
      {
        key: "remotes",
        title: t("local.facetRemote"),
        icon: <LuGitBranch size={16} />,
        entries: [...localFacets.remotes.entries()],
        selected: localFilters.remotes,
        labelFor: shortRemote,
        onToggle: (v) => setLocalFilters((f) => ({ ...f, remotes: toggleSetValue(f.remotes, v) })),
        onClear: () => setLocalFilters((f) => ({ ...f, remotes: new Set() })),
      },
    ],
    [localFacets, localFilters, t],
  );
  const insightsByRepo = useMemo(
    () => new Map(repoInsights.map((insight) => [insight.repo, insight])),
    [repoInsights],
  );
  const filteredIssues = useMemo(
    () => sortIssues(filterIssues(issues, issueFilters, userLogin), issueSort),
    [issues, issueFilters, issueSort, userLogin],
  );
  const filteredPullRequests = useMemo(
    () => sortPullRequests(filterPullRequests(pullRequests, prFilters, userLogin), prSort),
    [pullRequests, prFilters, prSort, userLogin],
  );
  const filteredRepos = useMemo(
    () => sortRepos(filterRepos(repos, issues, repoFilters, collaboratorsByRepo), issues, repoSort),
    [repos, issues, repoFilters, repoSort, collaboratorsByRepo],
  );
  const filteredInsights = useMemo(
    () =>
      filteredRepos
        .map((repo) => insightsByRepo.get(repo.nameWithOwner))
        .filter((value): value is RepoInsight => Boolean(value))
        .filter(
          (insight) =>
            insight.issueCount > 0 ||
            insight.securityAlertsCount > 0 ||
            insight.viewsCount > 0 ||
            insight.totalDownloads > 0,
        ),
    [filteredRepos, insightsByRepo],
  );
  const securityInsights = useMemo(
    () =>
      filteredRepos
        .map((repo) => insightsByRepo.get(repo.nameWithOwner))
        .filter((value): value is RepoInsight => Boolean(value))
        .filter((insight) => insight.securityAlertsCount > 0),
    [filteredRepos, insightsByRepo],
  );
  const issuePageSafe = clampPage(issuePage, filteredIssues.length, issuePageSize);
  const prPageSafe = clampPage(prPage, filteredPullRequests.length, prPageSize);
  const repoPageSafe = clampPage(repoPage, filteredRepos.length, repoPageSize);
  const visibleIssues = filteredIssues.slice(
    (issuePageSafe - 1) * issuePageSize,
    issuePageSafe * issuePageSize,
  );
  const visiblePullRequests = filteredPullRequests.slice(
    (prPageSafe - 1) * prPageSize,
    prPageSafe * prPageSize,
  );
  const visibleRepos = filteredRepos.slice(
    (repoPageSafe - 1) * repoPageSize,
    repoPageSafe * repoPageSize,
  );
  const draftCount = pullRequests.filter((pr) => pr.isDraft).length;
  const awaitingReviewCount = pullRequests.filter(
    (pr) => !pr.isDraft && pr.reviewsCount === 0,
  ).length;
  const approvedCount = pullRequests.filter((pr) => pr.reviewDecision === "APPROVED").length;
  const stalePrCount = pullRequests.filter(
    (pr) => Date.now() - new Date(pr.updatedAt).getTime() > 14 * 86_400_000,
  ).length;
  const totalOpenIssues = repoInsights.reduce((sum, insight) => sum + insight.issueCount, 0);
  const reposWithIssuesCount = repoInsights.filter((insight) => insight.issueCount > 0).length;
  // Unknown metrics are -1; exclude them from totals so a failed fetch never
  // inflates or deflates a sum (and never reads as a confident 0).
  // Metrics whose fetch failed carry an `errors` entry; exclude them from totals so
  // a failed read never inflates or deflates a sum (nor reads as a confident 0).
  const totalViews = repoInsights.reduce(
    (sum, insight) => (insight.errors?.views ? sum : sum + insight.viewsCount),
    0,
  );
  const totalReleaseDownloads = repoInsights.reduce(
    (sum, insight) => (insight.errors?.downloads ? sum : sum + insight.totalDownloads),
    0,
  );
  const totalSecurityAlerts = repoInsights.reduce(
    (sum, insight) => (insight.errors?.security ? sum : sum + insight.securityAlertsCount),
    0,
  );
  const viewsKnownCount = repoInsights.filter((insight) => !insight.errors?.views).length;
  const downloadsKnownCount = repoInsights.filter((insight) => !insight.errors?.downloads).length;
  const securityRepoCount = repoInsights.filter(
    (insight) => insight.securityAlertsCount > 0,
  ).length;
  const securityUnavailableCount = repoInsights.filter(
    (insight) => insight.errors?.security,
  ).length;
  const securityOpenIssues = securityInsights.reduce((sum, insight) => sum + insight.issueCount, 0);
  const reposByName = useMemo(
    () => new Map(repos.map((repo) => [repo.nameWithOwner, repo])),
    [repos],
  );
  const repoModal = useMemo(
    () => (routeRepoName && !routeMetricKind ? (reposByName.get(routeRepoName) ?? null) : null),
    [reposByName, routeMetricKind, routeRepoName],
  );
  const metricRepo =
    routeMetricKind && routeRepoName ? (reposByName.get(routeRepoName) ?? null) : null;
  const metricTotalCount =
    routeMetricKind === "stars"
      ? metricRepo?.stargazerCount
      : routeMetricKind === "forks"
        ? metricRepo?.forkCount
        : undefined;

  if (authState === "checking") {
    return (
      <div className="auth-gate">
        <div className="auth-card">
          <p className="auth-status">{t("common.loadingEllipsis")}</p>
        </div>
      </div>
    );
  }

  if (authState === "anonymous") {
    return (
      <AuthGate
        onAuthenticated={(login) => {
          setAuthLogin(login);
          setAuthState("authenticated");
        }}
      />
    );
  }

  const search =
    tab === "inbox"
      ? inboxSearch
      : tab === "repos" || tab === "insights" || tab === "alerts" || tab === "digests"
        ? repoFilters.search
        : tab === "prs"
          ? prFilters.search
          : issueFilters.search;
  const subtitle = [
    t("summary.issues", { count: issues.length }),
    t("summary.prs", { count: pullRequests.length }),
    t("summary.repos", { count: repos.length }),
    t("summary.orgs", { count: owners.length }),
    ...(totalSecurityAlerts > 0
      ? [t("summary.securityAlerts", { count: totalSecurityAlerts })]
      : []),
    ...(loading ? [t("summary.loading")] : []),
  ].join(" · ");
  const lastUpdated = fetchedAt
    ? t("common.updatedAt", { time: new Date(fetchedAt).toLocaleTimeString() })
    : "";

  function setSearch(value: string) {
    if (tab === "inbox") {
      setInboxSearch(value);
      setInboxPage(1);
    } else if (tab === "repos" || tab === "insights" || tab === "alerts" || tab === "digests") {
      setRepoFilters({ ...repoFilters, search: value });
      setRepoPage(1);
    } else if (tab === "prs") {
      setPrFilters({ ...prFilters, search: value });
      setPrPage(1);
    } else {
      setIssueFilters({ ...issueFilters, search: value });
      setIssuePage(1);
    }
  }

  function resetFilters() {
    if (tab === "repos" || tab === "insights" || tab === "alerts" || tab === "digests")
      setRepoFilters(defaultRepoFilters());
    else if (tab === "prs") setPrFilters(defaultPrFilters());
    else setIssueFilters(defaultIssueFilters());
    clearFiltersCache();
  }

  function navigateTab(nextTab: Tab) {
    navigate(TAB_ROUTES[nextTab]);
  }

  function cycleTheme() {
    setTheme(theme === "dark" ? "light" : theme === "light" ? "auto" : "dark");
  }

  function openRepoModal(repo: GhRepo, detail: DetailTab = "overview") {
    setSearchParams({ repo: repo.nameWithOwner, detail });
  }

  function closeRepoModal() {
    navigate(TAB_ROUTES[tab]);
  }

  function openMetricModal(repo: string, metric: MetricKind) {
    setSearchParams({ repo, metric });
  }

  function closeMetricModal() {
    navigate(TAB_ROUTES[tab]);
  }

  function changeRepoDetailTab(detail: DetailTab) {
    if (!repoModal) return;
    setSearchParams({ repo: repoModal.nameWithOwner, detail });
  }

  const tabs = [
    {
      key: "inbox" as const,
      label: t("tabs.inbox"),
      count: issues.length + pullRequests.length,
      icon: <InboxIcon />,
    },
    {
      key: "repos" as const,
      label: t("tabs.repositories"),
      count: repos.length,
      icon: <BookIcon />,
    },
    {
      key: "local" as const,
      label: t("tabs.local"),
      count: localReposCount < 0 ? "—" : localReposCount,
      icon: <FolderIcon />,
    },
    { key: "issues" as const, label: t("tabs.issues"), count: issues.length, icon: <IssueIcon /> },
    {
      key: "prs" as const,
      label: t("tabs.pullRequests"),
      count: pullRequests.length,
      icon: <PullRequestIcon />,
    },
    {
      key: "insights" as const,
      label: t("tabs.insights"),
      count: filteredInsights.length,
      icon: <BarChartIcon />,
    },
    {
      key: "alerts" as const,
      label: t("tabs.alerts"),
      count: totalSecurityAlerts,
      icon: <ShieldIcon />,
    },
    { key: "ci" as const, label: t("tabs.ci"), count: ciHealth.length, icon: <PulseIcon /> },
    {
      key: "digests" as const,
      label: t("tabs.digest"),
      count: dailyDigests.length,
      icon: <CalendarIcon />,
    },
    ...(projectsEnabled
      ? [{ key: "kanban" as const, label: t("tabs.board"), count: "—", icon: <BoardIcon /> }]
      : []),
  ];

  return (
    <>
      <TopBar
        subtitle={subtitle}
        lastUpdated={lastUpdated}
        loading={loading}
        theme={theme}
        textSize={textSize}
        onThemeChange={setTheme}
        onTextSizeChange={setTextSize}
        authLogin={authLogin}
        owners={owners}
        onRefresh={() => loadData(true)}
        onOpenFilters={() => setFiltersOpen(true)}
        onOpenPalette={() => setPaletteOpen(true)}
        onLogout={() => void handleLogout()}
        canLogout={authMode === "device"}
      />
      <div className="tabs-bar">
        <div className="tabs" role="tablist">
          {tabs.map((item) => (
            <button
              className={`tab ${tab === item.key ? "active" : ""}`}
              key={item.key}
              type="button"
              role="tab"
              onClick={() => navigateTab(item.key)}
            >
              {item.icon}
              {item.label} <span className="tab-badge">{item.count}</span>
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        className="sidebar-backdrop"
        style={{ border: "none", padding: 0 }}
        aria-label={t("common.closeFilters")}
        onClick={() => setFiltersOpen(false)}
      />
      <div className="layout">
        {tab === "local" ? (
          <FacetSidebar
            search={localFilters.search}
            onSearchChange={(value) => setLocalFilters((f) => ({ ...f, search: value }))}
            groups={localFacetGroups}
            extraSections={
              <FilterSection
                title={t("local.facetGitStatus")}
                activeCount={localFilters.status !== "all" ? 1 : 0}
                open
                onClear={() => setLocalFilters((f) => ({ ...f, status: "all" }))}
              >
                <div className="local-status-filter">
                  {(["all", "dirty", "clean"] as const).map((s) => (
                    <label className="check" key={s}>
                      <input
                        type="radio"
                        name="local-status"
                        checked={localFilters.status === s}
                        onChange={() => setLocalFilters((f) => ({ ...f, status: s }))}
                      />
                      <span className="label-text">{t(`local.status_${s}`)}</span>
                    </label>
                  ))}
                </div>
              </FilterSection>
            }
            onReset={() => setLocalFilters(defaultLocalFilters())}
            onClose={() => setFiltersOpen(false)}
          />
        ) : (
          <SidebarControls
            tab={tab}
            search={search}
            issueFilters={issueFilters}
            prFilters={prFilters}
            repoFilters={repoFilters}
            issueFacets={issueFacets}
            prFacets={prFacets}
            repoFacets={repoFacets}
            onSearchChange={setSearch}
            onIssueFiltersChange={(next) => {
              setIssueFilters(next);
              setIssuePage(1);
            }}
            onPrFiltersChange={(next) => {
              setPrFilters(next);
              setPrPage(1);
            }}
            onRepoFiltersChange={(next) => {
              setRepoFilters(next);
              setRepoPage(1);
            }}
            onReset={resetFilters}
            onClose={() => setFiltersOpen(false)}
            authLogin={authLogin || undefined}
            collaboratorsFetchedAt={collaboratorsFetchedAt}
            collaboratorsLoading={collaboratorsLoading}
            onRefreshCollaborators={refreshCollaborators}
            inbox={inboxSidebar}
          />
        )}
        <main className={`main${dataStale ? " data-stale" : ""}`}>
          {error ? <div className="error">{error}</div> : null}

          {tab === "inbox" ? (
            <InboxView
              items={mailboxItems}
              mailboxLabel={t(`mailbox.${mailbox}`)}
              search={inboxSearch}
              page={inboxPage}
              pageSize={inboxPageSize}
              reposByName={reposByName}
              onRepoClick={openRepoModal}
              onMarkRead={(threadId) => void handleMarkRead(threadId)}
              onRefresh={() => void refreshNotifications(true)}
              onPageChange={setInboxPage}
              onPageSizeChange={(size) => {
                setInboxPageSize(size);
                setInboxPage(1);
              }}
            />
          ) : null}

          {tab === "issues" ? (
            <div className="view-issues" style={{ display: "block" }}>
              <section className="stats">
                <div className="stat">
                  <div className="k">{t("stats.openIssues")}</div>
                  <div className="v">{formatNumber(filteredIssues.length)}</div>
                  <div className="sub">{t("stats.matchingFilters")}</div>
                </div>
                <div className="stat">
                  <div className="k">{t("stats.repositories")}</div>
                  <div className="v">
                    {new Set(filteredIssues.map((issue) => issue.repository.nameWithOwner)).size}
                  </div>
                  <div className="sub">{t("stats.withOpenIssues")}</div>
                </div>
                <div className="stat">
                  <div className="k">{t("stats.organizations")}</div>
                  <div className="v">
                    {
                      new Set(
                        filteredIssues.map((issue) => issue.repository.nameWithOwner.split("/")[0]),
                      ).size
                    }
                  </div>
                  <div className="sub">{t("stats.includingPersonal")}</div>
                </div>
                <div className="stat">
                  <div className="k">{t("stats.stale30")}</div>
                  <div className="v">
                    {
                      filteredIssues.filter(
                        (issue) =>
                          Date.now() - new Date(issue.updatedAt).getTime() > 30 * 86_400_000,
                      ).length
                    }
                  </div>
                  <div className="sub">{t("stats.noRecentActivity")}</div>
                </div>
              </section>
              <div className="toolbar">
                <div className="spacer" />
                <SortSelect
                  id="issues-sort"
                  value={issueSort}
                  options={ISSUE_SORT_OPTIONS}
                  onChange={setIssueSort}
                />
              </div>
              <IssueList issues={visibleIssues} />
              <Pagination
                totalItems={filteredIssues.length}
                page={issuePageSafe}
                pageSize={issuePageSize}
                onPageChange={setIssuePage}
                onPageSizeChange={(size) => {
                  setIssuePageSize(size);
                  setIssuePage(1);
                }}
              />
            </div>
          ) : null}

          {tab === "prs" ? (
            <div className="view-prs" style={{ display: "block" }}>
              <section className="stats">
                <div className="stat">
                  <div className="k">{t("stats.openPrs")}</div>
                  <div className="v">{formatNumber(filteredPullRequests.length)}</div>
                  <div className="sub">{t("stats.matchingFilters")}</div>
                </div>
                <div className="stat">
                  <div className="k">{t("stats.drafts")}</div>
                  <div className="v">{formatNumber(draftCount)}</div>
                  <div className="sub">{t("stats.acrossAllPrs")}</div>
                </div>
                <div className="stat">
                  <div className="k">{t("stats.awaitingReview")}</div>
                  <div className="v">{formatNumber(awaitingReviewCount)}</div>
                  <div className="sub">{t("stats.noReviewYet")}</div>
                </div>
                <div className="stat">
                  <div className="k">{t("stats.approved")}</div>
                  <div className="v">{formatNumber(approvedCount)}</div>
                  <div className="sub">{t("stats.readyToMerge")}</div>
                </div>
                <div className="stat">
                  <div className="k">{t("stats.stale14")}</div>
                  <div className="v">{formatNumber(stalePrCount)}</div>
                  <div className="sub">{t("stats.noRecentActivity")}</div>
                </div>
              </section>
              <div className="toolbar">
                <div className="spacer" />
                <label htmlFor="prs-preset">{t("common.preset")}</label>
                <select
                  id="prs-preset"
                  className="sort"
                  value={prFilters.preset}
                  onChange={(event) => {
                    setPrFilters({ ...prFilters, preset: event.target.value });
                    setPrPage(1);
                  }}
                >
                  <option value="">{t("common.all")}</option>
                  <option value="ready">{t("preset.ready")}</option>
                  <option value="draft">{t("preset.draft")}</option>
                  <option value="awaiting-review">{t("preset.awaitingReview")}</option>
                  <option value="approved">{t("preset.approved")}</option>
                  <option value="changes-requested">{t("preset.changesRequested")}</option>
                  <option value="assigned-me">{t("preset.assignedMe")}</option>
                  <option value="authored-me">{t("preset.authoredMe")}</option>
                  <option value="stale">{t("preset.stale")}</option>
                </select>
                <SortSelect id="prs-sort" value={prSort} options={PR_SORT_OPTIONS} onChange={setPrSort} />
              </div>
              <PullRequestList pullRequests={visiblePullRequests} />
              <Pagination
                totalItems={filteredPullRequests.length}
                page={prPageSafe}
                pageSize={prPageSize}
                onPageChange={setPrPage}
                onPageSizeChange={(size) => {
                  setPrPageSize(size);
                  setPrPage(1);
                }}
              />
            </div>
          ) : null}

          {tab === "repos" ? (
            <div className="view-repos" style={{ display: "block" }}>
              <section className="stats">
                <div className="stat">
                  <div className="k">{t("stats.repositories")}</div>
                  <div className="v">{formatNumber(filteredRepos.length)}</div>
                  <div className="sub">{t("stats.matchingFilters")}</div>
                </div>
                <div className="stat">
                  <div className="k">{t("stats.totalStars")}</div>
                  <div className="v">
                    {formatNumber(
                      filteredRepos.reduce((sum, repo) => sum + repo.stargazerCount, 0),
                    )}
                  </div>
                  <div className="sub">{t("stats.acrossShown")}</div>
                </div>
                <div className="stat">
                  <div className="k">{t("stats.totalForks")}</div>
                  <div className="v">
                    {formatNumber(filteredRepos.reduce((sum, repo) => sum + repo.forkCount, 0))}
                  </div>
                  <div className="sub">{t("stats.acrossShown")}</div>
                </div>
                <div className="stat" title={t("tip.totalOpenIssues")}>
                  <div className="k">{t("stats.openIssues")}</div>
                  <div className="v">{formatNumber(totalOpenIssues)}</div>
                  <div className="sub">{t("stats.acrossShown")}</div>
                </div>
              </section>
              <div className="toolbar">
                <div className="spacer" />
                <RepoViewControls
                  layout={repoLayout}
                  density={repoDensity}
                  onLayoutChange={setRepoLayout}
                  onCycleDensity={cycleRepoDensity}
                />
                <SortSelect
                  id="repos-sort"
                  value={repoSort}
                  options={REPO_SORT_OPTIONS}
                  onChange={setRepoSort}
                />
              </div>
              <ReposView
                layout={repoLayout}
                density={repoDensity}
                repos={visibleRepos}
                issues={issues}
                insightsByRepo={insightsByRepo}
                localClonesByRepo={localClonesByRepo}
                onLocalClick={(repo) =>
                  navigate(`${TAB_ROUTES.local}?localFocus=${encodeURIComponent(repo)}`)
                }
                onRepoClick={openRepoModal}
                onIssuesClick={(repo) => {
                  setIssueFilters({ ...issueFilters, repos: new Set([repo]) });
                  navigateTab("issues");
                }}
                onStarsClick={(repo) => openMetricModal(repo, "stars")}
                onForksClick={(repo) => openMetricModal(repo, "forks")}
              />
              <Pagination
                totalItems={filteredRepos.length}
                page={repoPageSafe}
                pageSize={repoPageSize}
                onPageChange={setRepoPage}
                onPageSizeChange={(size) => {
                  setRepoPageSize(size);
                  setRepoPage(1);
                }}
              />
            </div>
          ) : null}

          {tab === "insights" ? (
            <div className="view-insights" style={{ display: "block" }}>
              <section className="stats">
                <div className="stat" title={t("tip.totalOpenIssues")}>
                  <div className="k">{t("stats.openIssues")}</div>
                  <div className="v">{formatNumber(totalOpenIssues)}</div>
                  <div className="sub">{t("stats.acrossShown")}</div>
                </div>
                <div className="stat" title={t("tip.reposWithOpenIssues")}>
                  <div className="k">{t("stats.reposWithOpenIssues")}</div>
                  <div className="v">{formatNumber(reposWithIssuesCount)}</div>
                  <div className="sub">{t("stats.withOpenIssues")}</div>
                </div>
                <div className="stat" title={t("tip.totalViews")}>
                  <div className="k">{t("stats.totalViews")}</div>
                  <div className="v">{viewsKnownCount ? formatNumber(totalViews) : "—"}</div>
                  <div className="sub">{t("stats.last14Days")}</div>
                </div>
                <div className="stat" title={t("tip.totalDownloads")}>
                  <div className="k">{t("stats.totalDownloads")}</div>
                  <div className="v">
                    {downloadsKnownCount ? formatNumber(totalReleaseDownloads) : "—"}
                  </div>
                  <div className="sub">{t("stats.acrossReleaseAssets")}</div>
                </div>
              </section>
              <InsightsView
                insights={filteredInsights}
                reposByName={reposByName}
                onRepoClick={openRepoModal}
              />
            </div>
          ) : null}

          {tab === "alerts" ? (
            <div className="view-alerts" style={{ display: "block" }}>
              <section className="stats">
                <div className="stat" title={t("tip.totalSecurityAlerts")}>
                  <div className="k">{t("alerts.totalAlerts")}</div>
                  <div className="v">{formatNumber(totalSecurityAlerts)}</div>
                  <div className="sub">
                    {t("alerts.affectedRepos", { count: formatNumber(securityRepoCount) })}
                  </div>
                </div>
                <div className="stat" title={t("tip.reposAffected")}>
                  <div className="k">{t("alerts.reposWithAlerts")}</div>
                  <div className="v">{formatNumber(securityRepoCount)}</div>
                  <div className="sub">{t("alerts.securityFocusedView")}</div>
                </div>
                <div className="stat" title={t("tip.alertsUnavailable")}>
                  <div className="k">{t("stats.alertsUnavailable")}</div>
                  <div className="v">{formatNumber(securityUnavailableCount)}</div>
                  <div className="sub">{t("stats.couldNotLoad")}</div>
                </div>
                <div className="stat" title={t("tip.affectedOpenIssues")}>
                  <div className="k">{t("stats.openIssues")}</div>
                  <div className="v">{formatNumber(securityOpenIssues)}</div>
                  <div className="sub">{t("alerts.onAffectedRepos")}</div>
                </div>
              </section>
              <InsightsView
                insights={securityInsights}
                reposByName={reposByName}
                onRepoClick={openRepoModal}
                emptyTitleKey="alerts.emptyTitle"
                emptyTextKey="alerts.emptyText"
              />
            </div>
          ) : null}

          {tab === "ci"
            ? (() => {
                const totalRuns = ciHealth.reduce((sum, entry) => sum + entry.totalRuns, 0);
                const totalFailures = ciHealth.reduce((sum, entry) => sum + entry.failureCount, 0);
                const failingRepos = ciHealth.filter((entry) => entry.failureCount > 0).length;
                const decided = ciHealth.reduce(
                  (sum, entry) => sum + entry.successCount + entry.failureCount,
                  0,
                );
                const successes = ciHealth.reduce((sum, entry) => sum + entry.successCount, 0);
                const avgSuccessPct = decided ? Math.round((successes / decided) * 100) : 0;
                return (
                  <div className="view-ci" style={{ display: "block" }}>
                    <section className="stats">
                      <div className="stat">
                        <div className="k">{t("stats.reposWithCi")}</div>
                        <div className="v">{formatNumber(ciHealth.length)}</div>
                        <div className="sub">{t("stats.recentWorkflowRuns")}</div>
                      </div>
                      <div className="stat">
                        <div className="k">{t("stats.totalRuns")}</div>
                        <div className="v">{formatNumber(totalRuns)}</div>
                        <div className="sub">
                          {t("stats.lastRunsPerRepo", { count: ciHealth[0]?.totalRuns ?? 30 })}
                        </div>
                      </div>
                      <div className="stat">
                        <div className="k">{t("stats.avgSuccess")}</div>
                        <div className="v">{avgSuccessPct}%</div>
                        <div className="sub">{t("stats.acrossDecidedRuns")}</div>
                      </div>
                      <div className="stat">
                        <div className="k">{t("stats.failingRepos")}</div>
                        <div className="v">{formatNumber(failingRepos)}</div>
                        <div className="sub">
                          {t("stats.failuresTotal", { count: formatNumber(totalFailures) })}
                        </div>
                      </div>
                    </section>
                    <CIHealthView
                      data={ciHealth}
                      reposByName={reposByName}
                      onRepoClick={openRepoModal}
                    />
                  </div>
                );
              })()
            : null}

          {tab === "digests" ? (
            <div className="view-digests" style={{ display: "block" }}>
              <section className="stats">
                <div className="stat">
                  <div className="k">
                    {digestPeriod === "day"
                      ? t("stats.digestDays")
                      : digestPeriod === "week"
                        ? t("stats.digestWeeks")
                        : t("stats.digestMonths")}
                  </div>
                  <div className="v">{formatNumber(dailyDigests.length)}</div>
                  <div className="sub">
                    {digestPeriod === "day"
                      ? t("stats.daysWithSavedSnapshots")
                      : t("stats.periodsAggregated")}
                  </div>
                </div>
                <div className="stat">
                  <div className="k">{t("stats.latestIssueDelta")}</div>
                  <div className="v">
                    {dailyDigests[0]
                      ? `${dailyDigests[0].issueDelta >= 0 ? "+" : ""}${formatNumber(dailyDigests[0].issueDelta)}`
                      : "0"}
                  </div>
                  <div className="sub">
                    {t("stats.vsPrevious", {
                      period:
                        digestPeriod === "day" ? t("period.day") : t(`period.${digestPeriod}`),
                    })}
                  </div>
                </div>
                <div className="stat">
                  <div className="k">{t("stats.latestStarsDelta")}</div>
                  <div className="v">
                    {dailyDigests[0]
                      ? `${dailyDigests[0].starsDelta >= 0 ? "+" : ""}${formatNumber(dailyDigests[0].starsDelta)}`
                      : "0"}
                  </div>
                  <div className="sub">
                    {t("stats.vsPrevious", {
                      period:
                        digestPeriod === "day" ? t("period.day") : t(`period.${digestPeriod}`),
                    })}
                  </div>
                </div>
                <div className="stat">
                  <div className="k">{t("stats.latestStaleDelta")}</div>
                  <div className="v">
                    {dailyDigests[0]
                      ? `${dailyDigests[0].staleIssueDelta >= 0 ? "+" : ""}${formatNumber(dailyDigests[0].staleIssueDelta)}`
                      : "0"}
                  </div>
                  <div className="sub">
                    {t("stats.vsPrevious", {
                      period:
                        digestPeriod === "day" ? t("period.day") : t(`period.${digestPeriod}`),
                    })}
                  </div>
                </div>
                <div className="stat">
                  <div className="k">{t("alerts.totalAlerts")}</div>
                  <div className="v">
                    {dailyDigests[0] ? formatNumber(dailyDigests[0].securityAlertsCount) : "0"}
                  </div>
                  <div className="sub">
                    {dailyDigests[0]
                      ? t("digest.securityRepos", {
                          count: formatNumber(dailyDigests[0].securityReposCount),
                        })
                      : t("digest.securityUnavailable")}
                  </div>
                </div>
              </section>
              <DailyDigestView
                digests={dailyDigests}
                period={digestPeriod}
                onPeriodChange={setDigestPeriod}
              />
            </div>
          ) : null}

          {tab === "local" ? (
            <LocalReposView
              repos={filteredLocalRepos}
              totalCount={localRepos.length}
              scannedAt={localScannedAt}
              loading={localLoading}
              error={localError}
              config={localConfig}
              layout={localLayout}
              density={localDensity}
              sort={localSort}
              onLayoutChange={setLocalLayout}
              onCycleDensity={cycleLocalDensity}
              onSortChange={setLocalSort}
              onRescan={() => reloadLocalRepos(true)}
              onSaveConfig={saveLocalConfig}
              onHide={hideLocalRepo}
              onUnhide={unhideLocalRepo}
            />
          ) : null}

          {tab === "kanban" && projectsEnabled ? <KanbanView /> : null}
        </main>
      </div>
      <Footer />
      {paletteOpen ? (
        <CommandPalette
          repos={repos}
          issues={issues}
          pullRequests={pullRequests}
          onNavigateTab={(next) => navigateTab(next)}
          onOpenRepo={(repo) => openRepoModal(repo)}
          onRefresh={() => loadData(true)}
          onToggleTheme={cycleTheme}
          onExportRepos={() => downloadJson("repositories.json", filteredRepos)}
          onExportIssues={() => downloadJson("issues.json", filteredIssues)}
          onExportPullRequests={() => downloadJson("pull-requests.json", filteredPullRequests)}
          onClose={() => setPaletteOpen(false)}
        />
      ) : null}
      {welcomeOpen ? (
        <WelcomeModal
          onClose={() => {
            localStorage.setItem("gh-dash.welcomeSeen", "1");
            setWelcomeOpen(false);
          }}
          onViewChangelog={() => {
            localStorage.setItem("gh-dash.welcomeSeen", "1");
            setWelcomeOpen(false);
            setChangelogOpen(true);
          }}
        />
      ) : null}
      {contributorsOpen ? <ContributorsModal onClose={() => setContributorsOpen(false)} /> : null}
      {changelogOpen ? <ChangelogModal onClose={() => setChangelogOpen(false)} /> : null}
      {repoModal ? (
        <RepositoryDetailsModal
          repo={repoModal}
          issues={issues}
          pullRequests={pullRequests}
          activeTab={repoDetailTab}
          onTabChange={changeRepoDetailTab}
          onClose={closeRepoModal}
          onIssuesClick={(repo) => {
            closeRepoModal();
            setIssueFilters({ ...issueFilters, repos: new Set([repo]) });
            navigateTab("issues");
          }}
        />
      ) : null}
      {routeMetricKind && routeRepoName ? (
        <RepositoryMetricModal
          kind={routeMetricKind}
          repo={routeRepoName}
          totalCount={metricTotalCount}
          onClose={closeMetricModal}
        />
      ) : null}
    </>
  );
}
