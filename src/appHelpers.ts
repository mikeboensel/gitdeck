import type { DetailTab } from "./components/modals/RepositoryDetailsModal";
import type { MetricKind } from "./components/modals/RepositoryMetricModal";
import type { IssueFilters, PullRequestFilters, RepoFilters } from "./utils/dashboard";

export type Tab =
  | "inbox"
  | "repos"
  | "issues"
  | "prs"
  | "kanban"
  | "insights"
  | "alerts"
  | "ci"
  | "digests";

export const TAB_ROUTES: Record<Tab, string> = {
  inbox: "/inbox",
  repos: "/repositories",
  issues: "/issues",
  prs: "/pull-requests",
  kanban: "/board",
  insights: "/insights",
  alerts: "/alerts",
  ci: "/ci",
  digests: "/daily",
};

const ROUTE_TABS = new Map<string, Tab>(
  Object.entries(TAB_ROUTES).map(([tab, route]) => [route, tab as Tab]),
);
const DETAIL_TABS = new Set<DetailTab>([
  "overview",
  "actions",
  "pull-requests",
  "issues",
  "releases",
  "forks",
  "traffic",
  "mentions",
  "dependents",
]);
const METRIC_KINDS = new Set<MetricKind>(["stars", "forks"]);

export function tabFromPath(pathname: string): Tab {
  if (pathname === "/alert") return "alerts";
  return ROUTE_TABS.get(pathname) ?? "repos";
}

export function detailTabFromParams(params: URLSearchParams): DetailTab {
  const tab = params.get("detail");
  return tab && DETAIL_TABS.has(tab as DetailTab) ? (tab as DetailTab) : "overview";
}

export function metricKindFromParams(params: URLSearchParams): MetricKind | null {
  const metric = params.get("metric");
  return metric && METRIC_KINDS.has(metric as MetricKind) ? (metric as MetricKind) : null;
}

export const CACHE_KEY = {
  repos: "/api/repos",
  issues: "/api/issues",
  prs: "/api/prs",
  insights: "/api/repo-insights",
  digests: "/api/daily-digests",
  ciHealth: "/api/ci-health",
} as const;

export const defaultIssueFilters = (): IssueFilters => ({
  search: "",
  orgs: new Set(),
  repos: new Set(),
  labels: new Set(),
  authors: new Set(),
  assignees: new Set(),
  dates: { cf: "", ct: "", uf: "", ut: "" },
  preset: "",
});

export const defaultPrFilters = (): PullRequestFilters => ({
  search: "",
  orgs: new Set(),
  repos: new Set(),
  labels: new Set(),
  authors: new Set(),
  assignees: new Set(),
  dates: { cf: "", ct: "", uf: "", ut: "" },
  preset: "",
});

export const defaultRepoFilters = (): RepoFilters => ({
  search: "",
  orgs: new Set(),
  languages: new Set(),
  visibility: "all",
  includeForks: true,
  includeArchived: false,
});

export function downloadJson(filename: string, rows: unknown[]) {
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
