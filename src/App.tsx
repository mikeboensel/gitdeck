import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LuBuilding2,
  LuChevronRight,
  LuGitBranch,
  LuListFilter,
  LuSearch,
  LuServer,
} from "react-icons/lu";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { invalidate as invalidateCache, peek, swr } from "./api/cache";
import {
  AuthRequiredClientError,
  fetchAuthStatus,
  fetchCIHealth,
  fetchCollaborators,
  fetchCommitActivity,
  fetchDailyDigests,
  fetchIssues,
  fetchPullRequests,
  fetchRepoInsights,
  fetchRepos,
  logoutAuth,
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
  GridIcon,
  InboxIcon,
  IssueIcon,
  PullRequestIcon,
  PulseIcon,
  ShieldIcon,
} from "./components/common/Icons";
import { type SortOption, SortSelect } from "./components/common/SortSelect";
import { Footer, type FooterSegment, type FooterStat } from "./components/Footer";
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
import { AlertsPanel } from "./components/views/AlertsPanel";
import { CiPanel } from "./components/views/CiPanel";
import { DigestsPanel } from "./components/views/DigestsPanel";
import { InboxView } from "./components/views/InboxView";
import { InsightsPanel } from "./components/views/InsightsPanel";
import { IssuesPanel } from "./components/views/IssuesPanel";
import { KanbanView } from "./components/views/KanbanView";
import { LocalReposView } from "./components/views/LocalReposView";
import { PrsPanel } from "./components/views/PrsPanel";
import { ReposPanel } from "./components/views/ReposPanel";
import {
  REPO_DENSITY_OPTIONS,
  type RepoDensity,
  type RepoLayout,
} from "./components/views/ReposView";
import { RepoViewControls } from "./components/views/RepoViewControls";
import { WidgetHost } from "./components/widgets/WidgetHost";
import { useAccounts, useCapability } from "./contexts/AccountContext";
import { useCommandPaletteHotkey } from "./hooks/useCommandPaletteHotkey";
import { useEscapeToClose } from "./hooks/useEscapeToClose";
import { useInbox } from "./hooks/useInbox";
import { useLocalRepos } from "./hooks/useLocalRepos";
import { useTabsCompact } from "./hooks/useTabsCompact";
import { useI18n } from "./i18n/I18nProvider";
import type {
  CIHealthData,
  CommitActivityData,
  DailyDigestEntry,
  DailyDigestsData,
  DigestPeriod,
  GhIssue,
  GhPullRequest,
  GhRepo,
  IssuesData,
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
import {
  countIssueFilters,
  countLocalFilters,
  countPrFilters,
  countRepoFilters,
} from "./utils/footer";
import { formatNumber } from "./utils/format";
import type { InboxMailbox } from "./utils/inbox";
import {
  buildLocalFacets,
  DEFAULT_LOCAL_SORT,
  defaultLocalFilters,
  filterLocalRepos,
  type LocalRepoFilters,
  type LocalSort,
  shortRemote,
} from "./utils/localRepos";
import { clearStatsCache, readStatsCache, writeStatsCache } from "./utils/statsCache";

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
  const [commitActivity, setCommitActivity] = useState<CommitActivityData | null>(null);
  // Repo→collaborator-logins map, hydrated from localStorage for instant render.
  const [collaboratorsByRepo, setCollaboratorsByRepo] = useState<Map<string, string[]>>(() => {
    const cached = readCollaboratorsCache();
    return cached ? new Map(Object.entries(cached.byRepo)) : new Map();
  });
  const [collaboratorsFetchedAt, setCollaboratorsFetchedAt] = useState<string | null>(
    () => readCollaboratorsCache()?.fetchedAt ?? null,
  );
  const [collaboratorsLoading, setCollaboratorsLoading] = useState(false);
  // Local-repo dataset + mutations (disk state, not account-scoped); the data
  // layer lives in the hook. Filtering and facets stay here (see below), driven
  // by the locally-owned, persisted filter/sort state.
  const {
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
  } = useLocalRepos({ authenticated: authState === "authenticated", tab });
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
  // Desktop-only: collapse the filter sidebar to reclaim horizontal space.
  // Mobile uses the slide-in drawer (filtersOpen) instead, so this is ignored there.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("gh-dash.sidebarCollapsed") === "true",
  );
  const [contributorsOpen, setContributorsOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(
    () => !localStorage.getItem("gh-dash.welcomeSeen"),
  );
  const [paletteOpen, setPaletteOpen] = useState(false);
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
  // Collapse the tab bar to icon-only when the full labels would overflow.
  const { tabsRef, tabsCompact } = useTabsCompact();

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
    clearNotifications();
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: activeAccountId is an intentional re-run trigger so account-scoped commit activity is refetched when the active account changes
  useEffect(() => {
    if (authState !== "authenticated") return;
    if (tab !== "insights") return;
    const cached = peek<CommitActivityData>(CACHE_KEY.commitActivity);
    if (cached) setCommitActivity(cached);
    const controller = new AbortController();
    swr<CommitActivityData>(
      CACHE_KEY.commitActivity,
      (signal) => fetchCommitActivity(false, signal),
      { signal: controller.signal },
    )
      .promise.then((data) => {
        if (!controller.signal.aborted) setCommitActivity(data);
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

  useCommandPaletteHotkey(setPaletteOpen);

  useEscapeToClose({
    paletteOpen,
    routeRepoName,
    changelogOpen,
    contributorsOpen,
    welcomeOpen,
    filtersOpen,
    tab,
    navigate,
    setPaletteOpen,
    setChangelogOpen,
    setContributorsOpen,
    setWelcomeOpen,
    setFiltersOpen,
  });

  useEffect(() => localStorage.setItem("gh-dash.repoLayout", repoLayout), [repoLayout]);
  useEffect(() => localStorage.setItem("gh-dash.repoDensity", repoDensity), [repoDensity]);
  useEffect(() => localStorage.setItem("gh-dash.localLayout", localLayout), [localLayout]);
  useEffect(() => localStorage.setItem("gh-dash.localDensity", localDensity), [localDensity]);
  useEffect(() => {
    localStorage.setItem("gh-dash.sidebarCollapsed", String(sidebarCollapsed));
    document.body.classList.toggle("sidebar-collapsed", sidebarCollapsed);
  }, [sidebarCollapsed]);
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

  const userLogin = owners[0] || "";
  const {
    refreshNotifications,
    clearNotifications,
    handleMarkRead,
    handleMarkAllRead,
    inboxItems,
    mailboxItems,
    inboxCounts,
    inboxUnreadCount,
  } = useInbox({
    authenticated: authState === "authenticated",
    accountId: activeAccountId,
    issues,
    pullRequests,
    userLogin,
    mailbox,
  });

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
  // Repos hidden solely because archived repos are excluded by default — i.e.
  // how many more would show if "Include archived" were on. Surfaced in the
  // footer so the shown/total gap is self-explanatory.
  const archivedHiddenCount = useMemo(() => {
    if (repoFilters.includeArchived) return 0;
    const withArchived = filterRepos(
      repos,
      issues,
      { ...repoFilters, includeArchived: true },
      collaboratorsByRepo,
    );
    return withArchived.length - filteredRepos.length;
  }, [repos, issues, repoFilters, collaboratorsByRepo, filteredRepos.length]);
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
  // Footer/tab-badge totals. The per-panel insight/alert stats live in their
  // panels; these two stay because the footer and tab chrome need them too.
  // Metrics whose fetch failed (`errors`) are excluded so a failed read never
  // skews a sum.
  const totalOpenIssues = repoInsights.reduce((sum, insight) => sum + insight.issueCount, 0);
  const totalSecurityAlerts = repoInsights.reduce(
    (sum, insight) => (insight.errors?.security ? sum : sum + insight.securityAlertsCount),
    0,
  );
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
      // ReposPanel resets to page 1 itself when its filters change (repos tab).
      setRepoFilters({ ...repoFilters, search: value });
    } else if (tab === "prs") {
      // PrsPanel resets to page 1 itself when its filters prop changes.
      setPrFilters({ ...prFilters, search: value });
    } else {
      // IssuesPanel resets to page 1 itself via its resetKey (the filter object).
      setIssueFilters({ ...issueFilters, search: value });
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
    { key: "lab" as const, label: "Viz Lab", count: "—", icon: <GridIcon /> },
  ];

  // Footer status bar: reflect the current tab plus how many items are shown and
  // how many filter selections are active for that tab.
  const repoFilterCount = countRepoFilters(repoFilters);
  const issueFilterCount = countIssueFilters(issueFilters);
  const prFilterCount = countPrFilters(prFilters);
  const localFilterCount = countLocalFilters(localFilters);
  const footerStats: Record<Tab, { shown: number; total: number; filters: number }> = {
    inbox: { shown: mailboxItems.length, total: inboxItems.length, filters: 0 },
    repos: { shown: filteredRepos.length, total: repos.length, filters: repoFilterCount },
    local: {
      shown: filteredLocalRepos.length,
      total: localRepos.length,
      filters: localFilterCount,
    },
    issues: { shown: filteredIssues.length, total: issues.length, filters: issueFilterCount },
    prs: { shown: filteredPullRequests.length, total: pullRequests.length, filters: prFilterCount },
    insights: {
      shown: filteredInsights.length,
      total: filteredInsights.length,
      filters: repoFilterCount,
    },
    alerts: {
      shown: securityInsights.length,
      total: securityInsights.length,
      filters: repoFilterCount,
    },
    ci: { shown: ciHealth.length, total: ciHealth.length, filters: 0 },
    digests: { shown: dailyDigests.length, total: dailyDigests.length, filters: 0 },
    kanban: { shown: filteredIssues.length, total: issues.length, filters: issueFilterCount },
    lab: {
      shown: filteredInsights.length,
      total: filteredInsights.length,
      filters: repoFilterCount,
    },
  };
  const fc = footerStats[tab];
  const currentTabMeta = tabs.find((item) => item.key === tab);
  const footerSegments: FooterSegment[] = [];
  if (currentTabMeta) {
    footerSegments.push({
      key: "tab",
      icon: currentTabMeta.icon,
      label: currentTabMeta.label,
      strong: true,
    });
  }
  const countLabel =
    fc.shown === fc.total
      ? formatNumber(fc.total)
      : `${formatNumber(fc.shown)} ${t("common.of")} ${formatNumber(fc.total)}`;
  // On the repos tab, explain the shown/total gap left by hidden archived repos.
  const archivedNote =
    tab === "repos" && archivedHiddenCount > 0
      ? ` · ${t("stats.archivedHidden", { count: formatNumber(archivedHiddenCount) })}`
      : "";
  footerSegments.push({
    key: "count",
    label: `${countLabel}${archivedNote}`,
  });
  if (fc.filters > 0) {
    footerSegments.push({
      key: "filters",
      icon: <LuListFilter size={13} />,
      label: `${fc.filters} ${t("common.filters")}`,
    });
  }
  if (search) {
    footerSegments.push({
      key: "search",
      icon: <LuSearch size={13} />,
      label: `“${search}”`,
    });
  }

  // Repos tab: summary stats pinned to the right of the status bar. Values
  // reflect the currently shown (filtered) repositories.
  const footerStatItems: FooterStat[] =
    tab === "repos"
      ? [
          {
            key: "repos",
            label: t("stats.repositories"),
            value: formatNumber(filteredRepos.length),
            title: t("stats.matchingFilters"),
          },
          {
            key: "stars",
            label: t("stats.totalStars"),
            value: formatNumber(filteredRepos.reduce((sum, repo) => sum + repo.stargazerCount, 0)),
            title: t("stats.acrossShown"),
          },
          {
            key: "forks",
            label: t("stats.totalForks"),
            value: formatNumber(filteredRepos.reduce((sum, repo) => sum + repo.forkCount, 0)),
            title: t("stats.acrossShown"),
          },
          {
            key: "issues",
            label: t("stats.openIssues"),
            value: formatNumber(totalOpenIssues),
            title: t("tip.totalOpenIssues"),
          },
        ]
      : [];

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
        <div className={`tabs${tabsCompact ? " compact" : ""}`} role="tablist" ref={tabsRef}>
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
            onCollapse={() => setSidebarCollapsed(true)}
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
            onIssueFiltersChange={(next) => setIssueFilters(next)}
            onPrFiltersChange={(next) => setPrFilters(next)}
            onRepoFiltersChange={(next) => setRepoFilters(next)}
            onReset={resetFilters}
            onClose={() => setFiltersOpen(false)}
            onCollapse={() => setSidebarCollapsed(true)}
            authLogin={authLogin || undefined}
            collaboratorsFetchedAt={collaboratorsFetchedAt}
            collaboratorsLoading={collaboratorsLoading}
            onRefreshCollaborators={refreshCollaborators}
            inbox={inboxSidebar}
            viewControls={
              tab === "repos" ? (
                <>
                  <RepoViewControls
                    layout={repoLayout}
                    density={repoDensity}
                    onLayoutChange={setRepoLayout}
                    onCycleDensity={cycleRepoDensity}
                  />
                  <div className="sidebar-sort">
                    <SortSelect
                      id="repos-sort"
                      value={repoSort}
                      options={REPO_SORT_OPTIONS}
                      onChange={setRepoSort}
                    />
                  </div>
                </>
              ) : undefined
            }
          />
        )}
        <button
          type="button"
          className="sidebar-expand-edge tip"
          data-tip={t("common.expandFilters")}
          aria-label={t("common.expandFilters")}
          onClick={() => setSidebarCollapsed(false)}
        >
          <LuChevronRight size={16} />
        </button>
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
            <IssuesPanel
              issues={filteredIssues}
              sort={issueSort}
              onSortChange={setIssueSort}
              resetKey={issueFilters}
            />
          ) : null}

          {tab === "prs" ? (
            <PrsPanel
              pullRequests={pullRequests}
              filtered={filteredPullRequests}
              filters={prFilters}
              onFiltersChange={setPrFilters}
              sort={prSort}
              onSortChange={setPrSort}
            />
          ) : null}

          {tab === "repos" ? (
            <ReposPanel
              layout={repoLayout}
              density={repoDensity}
              repos={filteredRepos}
              resetKey={repoFilters}
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
          ) : null}

          {tab === "insights" ? (
            <InsightsPanel
              repoInsights={repoInsights}
              insights={filteredInsights}
              commitActivity={commitActivity}
              reposByName={reposByName}
              onRepoClick={openRepoModal}
            />
          ) : null}

          {tab === "alerts" ? (
            <AlertsPanel
              repoInsights={repoInsights}
              securityInsights={securityInsights}
              reposByName={reposByName}
              onRepoClick={openRepoModal}
            />
          ) : null}

          {tab === "ci" ? (
            <CiPanel ciHealth={ciHealth} reposByName={reposByName} onRepoClick={openRepoModal} />
          ) : null}

          {tab === "digests" ? (
            <DigestsPanel
              digests={dailyDigests}
              period={digestPeriod}
              onPeriodChange={setDigestPeriod}
            />
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
              onDelete={deleteLocalRepo}
            />
          ) : null}

          {tab === "kanban" && projectsEnabled ? <KanbanView /> : null}

          {tab === "lab" ? (
            <WidgetHost
              ctx={{ insights: filteredInsights, reposByName, onRepoClick: openRepoModal }}
            />
          ) : null}
        </main>
      </div>
      <Footer segments={footerSegments} stats={footerStatItems} />
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
