export interface GhLabel {
  name: string;
  color?: string;
  description?: string;
}

export interface GhUser {
  login: string;
  url?: string;
  avatarUrl?: string;
  avatar_url?: string;
}

export interface GhIssue {
  repository: { name: string; nameWithOwner: string };
  title: string;
  url: string;
  number: number;
  createdAt: string;
  updatedAt: string;
  author?: GhUser;
  labels: GhLabel[];
  commentsCount: number;
  assignees?: GhUser[];
}

export type ReviewDecision = "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;

export interface GhPullRequest {
  repository: { name: string; nameWithOwner: string };
  title: string;
  url: string;
  number: number;
  createdAt: string;
  updatedAt: string;
  author?: GhUser;
  labels: GhLabel[];
  commentsCount: number;
  assignees?: GhUser[];
  isDraft: boolean;
  reviewDecision: ReviewDecision;
  reviewsCount: number;
  additions: number;
  deletions: number;
  changedFiles: number;
  baseRefName: string;
  headRefName: string;
}

export interface CIRunSummary {
  id: number;
  workflowName: string;
  status: string;
  conclusion: string | null;
  event: string;
  headBranch: string | null;
  url: string;
  createdAt: string;
  updatedAt: string;
  durationSec: number | null;
}

export interface RepoCIHealth {
  repo: string;
  url: string;
  totalRuns: number;
  successCount: number;
  failureCount: number;
  cancelledCount: number;
  skippedCount: number;
  inProgressCount: number;
  successRate: number;
  avgDurationSec: number | null;
  lastRun: CIRunSummary | null;
  lastFailure: CIRunSummary | null;
  lastSuccess: CIRunSummary | null;
}

export interface CIHealthData {
  ok: true;
  repos: RepoCIHealth[];
  fetchedAt: string;
}

export interface SnapshotEntry {
  date: string;
  stars: number;
  forks: number;
}

export interface GhRepo {
  nameWithOwner: string;
  name: string;
  owner: { login: string; avatarUrl?: string };
  description: string | null;
  stargazerCount: number;
  forkCount: number;
  primaryLanguage: { name: string } | null;
  updatedAt: string;
  pushedAt: string;
  visibility: string;
  isPrivate: boolean;
  isArchived: boolean;
  isFork: boolean;
  url: string;
  history?: SnapshotEntry[];
}

export interface ReposData {
  ok: true;
  repos: GhRepo[];
  owners: string[];
  fetchedAt: string;
}

/** A single git remote configured in a local clone's .git/config. */
export interface LocalRemote {
  /** Remote name, e.g. "origin", "upstream". */
  name: string;
  /** Remote URL as configured. */
  url: string;
  /** Parsed host (e.g. "github.com"), or null if unparseable. */
  host: string | null;
  /** Parsed owner segment, or null. */
  owner: string | null;
}

/**
 * Breakdown of a working tree's pending changes, parsed from
 * `git status --porcelain`. A file can be counted in both `staged` and
 * `modified` (e.g. an `MM` entry — staged then edited again).
 */
export interface GitChangeCounts {
  /** Files with index (staged) changes — the porcelain X column. */
  staged: number;
  /** Tracked files with unstaged working-tree changes — the Y column. */
  modified: number;
  /** Untracked files (`??`). */
  untracked: number;
  /** Unmerged paths (merge/rebase conflicts). */
  conflicted: number;
}

/** A git repository discovered on the local filesystem. */
export interface LocalRepo {
  /** Absolute path to the repo's working directory. */
  path: string;
  /** Directory name (or remote repo name when known). */
  name: string;
  /** `origin` remote URL, or null when no remote is configured. */
  remoteUrl: string | null;
  /** All configured remotes (origin, upstream, …), read offline from .git/config. */
  remotes: LocalRemote[];
  /** Parsed `owner/repo` from the authoritative (origin) remote, or null. */
  nameWithOwner: string | null;
  /** Host parsed from the origin remote (e.g. "github.com"), or null. */
  host: string | null;
  /** Current branch name, or null when detached/unknown. */
  branch: string | null;
  /** Commits ahead of upstream (0 when no upstream). */
  ahead: number;
  /** Commits behind upstream (0 when no upstream). */
  behind: number;
  /** Whether the working tree has uncommitted changes (any `changes` count > 0). */
  dirty: boolean;
  /** Granular breakdown of the working tree's pending changes. */
  changes: GitChangeCounts;
  /** Most recent commit, or null for an empty repo. */
  lastCommit: { sha: string; date: string; message: string } | null;
  /** True when this checkout is a linked worktree rather than the primary clone. */
  isWorktree: boolean;
  /**
   * Absolute path to the shared git common dir. The primary clone and all its
   * linked worktrees share this value — used to cluster them under one repo.
   */
  gitCommonDir: string | null;
  /** GitHub metadata when the user's token could read the repo. */
  enrichment: GhRepo | null;
  /**
   * Outcome of the GitHub enrichment attempt:
   * - `enriched`    — fetched GitHub metadata successfully
   * - `unreachable` — github.com remote but token got 403/404 (private/blocked)
   * - `local-only`  — remote host isn't an enrichable GitHub host
   * - `no-remote`   — repo has no origin remote
   */
  enrichmentStatus: "enriched" | "unreachable" | "local-only" | "no-remote";
}

export interface LocalReposData {
  ok: true;
  repos: LocalRepo[];
  scannedAt: string;
}

/** User-tunable scan configuration, persisted at ~/.gitdeck/local-repos.json. */
export interface LocalReposConfig {
  /** Root directories to scan. Empty ⇒ server default (home directory). */
  scanRoots: string[];
  /** Extra path-segment names to prune, on top of the built-in defaults. */
  excludes: string[];
  /** Absolute repo paths to hide from results (triage). */
  denylist: string[];
}

export interface IssuesData {
  ok: true;
  issues: GhIssue[];
  owners: string[];
  fetchedAt: string;
}

export interface PullRequestsData {
  ok: true;
  pullRequests: GhPullRequest[];
  owners: string[];
  fetchedAt: string;
}

export interface ApiError {
  ok: false;
  error: string;
}

export interface PageInfo {
  endCursor: string | null;
  hasNextPage: boolean;
}

export interface StargazerNode {
  starredAt: string;
  node: { login: string; avatarUrl: string; url: string };
}

export interface ForkNode {
  nameWithOwner: string;
  owner: { login: string; avatarUrl: string };
  stargazerCount: number;
  forkCount: number;
  pushedAt: string;
  updatedAt: string;
  createdAt: string;
  url: string;
  description: string | null;
  primaryLanguage: { name: string } | null;
}

export interface RepoContributor {
  login?: string;
  name?: string;
  email?: string;
  avatar_url?: string;
  avatarUrl?: string;
  html_url?: string;
  url?: string;
  contributions: number;
}

export interface RepoTrafficViews {
  count: number;
  uniques: number;
  views?: Array<{
    timestamp: string;
    count: number;
    uniques: number;
  }>;
}

export interface RepoTrafficReferrer {
  referrer: string;
  count: number;
  uniques: number;
}

export interface RepoTrafficPath {
  path: string;
  title: string;
  count: number;
  uniques: number;
}

export interface RepoReleaseAsset {
  id: number;
  name: string;
  download_count: number;
  size?: number;
  browser_download_url?: string;
}

export interface RepoRelease {
  id: number;
  name: string | null;
  tag_name: string;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  created_at?: string | null;
  assets: RepoReleaseAsset[];
  totalDownloads: number;
}

export interface RepoWorkflowRun {
  id: number;
  name: string | null;
  display_title?: string | null;
  html_url: string;
  status: string;
  conclusion: string | null;
  event: string;
  head_branch: string | null;
  run_number: number;
  run_started_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RepoSecuritySummary {
  dependabotOpen: number;
  codeScanningOpen: number;
  totalOpen: number;
  latestUpdatedAt: string | null;
  unavailable: boolean;
  /** Human-readable reason the alerts could not be read (status + GitHub message). */
  unavailableReason?: string;
}

export interface RepoDetailsData {
  ok: true;
  meta: {
    description?: string | null;
    homepage?: string | null;
    topics?: string[];
    license?: { name: string } | null;
    default_branch?: string;
  } | null;
  languages: Record<string, number>;
  contributors: RepoContributor[];
  views: RepoTrafficViews | null;
  releases: RepoRelease[];
  workflows: RepoWorkflowRun[];
  security: RepoSecuritySummary;
  digest?: DailyRepoDigest | null;
  errors?: Record<string, string | null>;
}

export interface RepoTrafficDetails {
  ok: true;
  forbidden: boolean;
  referrers: RepoTrafficReferrer[];
  paths: RepoTrafficPath[];
  views: RepoTrafficViews | null;
  clones: {
    count: number;
    uniques: number;
    clones?: Array<{
      timestamp: string;
      count: number;
      uniques: number;
    }>;
  } | null;
}

export interface RepoInsight {
  repo: string;
  issueCount: number;
  staleIssueCount: number;
  daysSincePush: number;
  daysSinceUpdate: number;
  starsDelta: number | null;
  forksDelta: number | null;
  releaseCount: number;
  // Per-repo fetched metrics. When the underlying call failed, the value is 0 and
  // the matching `errors` entry holds the reason — never show a failed fetch as a
  // real 0; consult `errors` first.
  totalDownloads: number;
  recentDownloads: number;
  viewsCount: number;
  viewsUniques: number;
  securityAlertsCount: number;
  latestReleasePublishedAt: string | null;
  /** Reason a metric could not be read (HTTP status + GitHub's message), per group. */
  errors?: RepoInsightErrors;
}

export interface RepoInsightErrors {
  views?: string;
  downloads?: string;
  security?: string;
}

export interface RepoInsightsData {
  ok: true;
  generatedAt: string;
  insights: RepoInsight[];
}

/** One repo's commit count on one day (sparse — only days with commits). */
export interface CommitActivityDay {
  repo: string;
  /** ISO calendar day, e.g. "2025-06-23". */
  date: string;
  count: number;
}

export interface CommitActivityData {
  ok: true;
  generatedAt: string;
  /** Sparse per-repo, per-day commit counts for the authenticated user. */
  days: CommitActivityDay[];
  /** Repo keys present, for stable legend ordering. */
  repos: string[];
}

export interface DailyRepoDigest {
  repo: string;
  date: string;
  stars: number;
  forks: number;
  issueCount: number;
  staleIssueCount: number;
  securityAlertsCount: number;
  securityAlertsUnavailable: boolean;
  starsDelta: number;
  forksDelta: number;
  issueDelta: number;
  staleIssueDelta: number;
  securityAlertsDelta: number;
  highlights: string[];
  executiveSummary: string[];
  momentum: string[];
  risks: string[];
  ai?: {
    model: string;
    headline: string;
    briefing: string[];
    generatedAt: string;
  } | null;
}

export interface DailyDigestEntry {
  date: string;
  repoCount: number;
  issueCount: number;
  staleIssueCount: number;
  securityAlertsCount: number;
  securityReposCount: number;
  securityAlertsUnavailable: boolean;
  totalStars: number;
  totalForks: number;
  issueDelta: number;
  staleIssueDelta: number;
  starsDelta: number;
  forksDelta: number;
  highlights: string[];
  executiveSummary: string[];
  momentum: string[];
  risks: string[];
  repos: DailyRepoDigest[];
  ai?: {
    model: string;
    headline: string;
    briefing: string[];
    generatedAt: string;
  } | null;
}

export type DigestPeriod = "day" | "week" | "month";

export interface DailyDigestsData {
  ok: true;
  generatedAt: string;
  period?: DigestPeriod;
  digests: DailyDigestEntry[];
}

export type GhNotificationReason =
  | "assign"
  | "author"
  | "comment"
  | "ci_activity"
  | "invitation"
  | "manual"
  | "member_feature_requested"
  | "mention"
  | "push"
  | "review_requested"
  | "security_advisory_credit"
  | "security_alert"
  | "state_change"
  | "subscribed"
  | "team_mention";

export type GhNotificationSubjectType =
  | "Issue"
  | "PullRequest"
  | "Commit"
  | "Release"
  | "RepositoryAdvisory"
  | "RepositoryDependabotAlertsThread"
  | "RepositoryVulnerabilityAlert"
  | "Discussion"
  | "CheckSuite"
  | "WorkflowRun";

export interface GhNotification {
  id: string;
  unread: boolean;
  reason: GhNotificationReason;
  updatedAt: string;
  lastReadAt: string | null;
  subject: {
    title: string;
    url: string | null;
    latestCommentUrl: string | null;
    type: GhNotificationSubjectType | string;
  };
  repository: {
    name: string;
    nameWithOwner: string;
    private: boolean;
    htmlUrl: string;
  };
  itemNumber: number | null;
  itemHtmlUrl: string | null;
}

export interface NotificationsData {
  ok: true;
  notifications: GhNotification[];
  fetchedAt: string;
  pollInterval: number;
}

export interface MentionIssueItem {
  repository: { nameWithOwner: string };
  title: string;
  url: string;
  number: number;
  createdAt: string;
  updatedAt: string;
  state: string;
  isPullRequest?: boolean;
  author?: { login: string; url: string };
}

export interface MentionCodeItem {
  repository: { nameWithOwner: string };
  path: string;
  url: string;
}

export interface DependentItem {
  owner: string;
  repo: string;
  nameWithOwner: string;
  url: string;
  stars: number;
  forks: number;
  avatar: string;
}

export interface ProjectSummary {
  id: string;
  number: number;
  title: string;
  url: string;
  closed: boolean;
  shortDescription: string | null;
  updatedAt?: string;
  items?: { totalCount: number };
  owner: { __typename: string; login?: string };
  linkedRepos?: string[];
}

export interface ProjectFieldOption {
  id: string;
  name: string;
  color?: string;
}

export interface ProjectField {
  __typename: string;
  id: string;
  name: string;
  dataType?: string;
  options?: ProjectFieldOption[];
}

export interface ProjectItem {
  id: string;
  isArchived: boolean;
  type: string;
  content?: {
    __typename?: string;
    number?: number;
    title?: string;
    url?: string;
    state?: string;
    repository?: { nameWithOwner: string };
    author?: GhUser;
    labels?: { nodes: GhLabel[] };
    assignees?: { nodes: GhUser[] };
    createdAt?: string;
    updatedAt?: string;
  };
  fieldValues?: {
    nodes: Array<{
      __typename: string;
      field?: { id: string; name: string };
      name?: string;
      optionId?: string;
    }>;
  };
}

export interface ProjectDetails {
  id: string;
  number: number;
  title: string;
  url: string;
  closed: boolean;
  shortDescription: string | null;
  owner: { __typename: string; login?: string };
  fields: ProjectField[];
  items: ProjectItem[];
  totalCount: number;
  truncated: boolean;
}
