import { useEffect, useState } from "react";
import {
  addRepoAlias,
  fetchDependents,
  fetchMentionCode,
  fetchMentionIssues,
  fetchRepoDetails,
  fetchRepoTraffic,
  removeRepoAlias,
} from "../../api/github";
import type {
  DependentItem,
  GhIssue,
  GhPullRequest,
  GhRepo,
  MentionCodeItem,
  MentionIssueItem,
  RepoDetailsData,
  RepoTrafficDetails,
} from "../../types/github";
import { isValidRepoName } from "../../utils/aliasQuery";
import { getLanguageColor } from "../../utils/colors";
import { issueCountForRepo } from "../../utils/dashboard";
import { errorMessage } from "../../utils/errors";
import { formatNumber, formatRelativeTime } from "../../utils/format";
import { CloseIcon, ForkIcon, IssueIcon, StarIcon } from "../common/Icons";
import { ActionsPanel } from "./repoDetail/ActionsPanel";
import { DependentsPanel } from "./repoDetail/DependentsPanel";
import { ForksPanel } from "./repoDetail/ForksPanel";
import { IssuesPanel } from "./repoDetail/IssuesPanel";
import { MentionsPanel } from "./repoDetail/MentionsPanel";
import { OverviewPanel } from "./repoDetail/OverviewPanel";
import { PullRequestsPanel } from "./repoDetail/PullRequestsPanel";
import { ReleasesPanel } from "./repoDetail/ReleasesPanel";
import { TrafficPanel } from "./repoDetail/TrafficPanel";

interface RepositoryDetailsModalProps {
  repo: GhRepo;
  issues: GhIssue[];
  pullRequests: GhPullRequest[];
  activeTab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
  onClose: () => void;
  onIssuesClick: (repo: string) => void;
}

export type DetailTab =
  | "overview"
  | "actions"
  | "pull-requests"
  | "issues"
  | "releases"
  | "forks"
  | "traffic"
  | "mentions"
  | "dependents";

export function RepositoryDetailsModal({
  repo,
  issues,
  pullRequests,
  activeTab,
  onTabChange,
  onClose,
  onIssuesClick,
}: RepositoryDetailsModalProps) {
  const [details, setDetails] = useState<RepoDetailsData | null>(null);
  const [mentionIssues, setMentionIssues] = useState<MentionIssueItem[]>([]);
  const [mentionCode, setMentionCode] = useState<MentionCodeItem[]>([]);
  const [dependents, setDependents] = useState<DependentItem[]>([]);
  const [trafficDetails, setTrafficDetails] = useState<RepoTrafficDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [aliases, setAliases] = useState<string[]>([]);
  const [aliasInput, setAliasInput] = useState("");
  const [aliasError, setAliasError] = useState("");
  const [aliasBusy, setAliasBusy] = useState(false);
  const [mentionsRefreshKey, setMentionsRefreshKey] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: mentionsRefreshKey is an intentional refetch trigger
  useEffect(() => {
    let cancelled = false;

    async function loadDetails() {
      setLoading(true);
      setError("");
      try {
        const [detailsResult, issueRefs, codeRefs, dependentRefs, trafficResult] =
          await Promise.all([
            fetchRepoDetails(repo.nameWithOwner),
            fetchMentionIssues(repo.nameWithOwner),
            fetchMentionCode(repo.nameWithOwner),
            fetchDependents(repo.nameWithOwner),
            fetchRepoTraffic(repo.nameWithOwner),
          ]);
        if (!cancelled) {
          setDetails(detailsResult);
          setMentionIssues(issueRefs.items);
          setMentionCode(codeRefs.items);
          setAliases(issueRefs.aliases ?? []);
          setDependents(dependentRefs.items);
          setTrafficDetails(trafficResult);
        }
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadDetails();
    return () => {
      cancelled = true;
    };
  }, [repo.nameWithOwner, mentionsRefreshKey]);

  async function submitAlias() {
    const value = aliasInput.trim();
    if (!isValidRepoName(value)) {
      setAliasError("Use the owner/repo format.");
      return;
    }
    if (value === repo.nameWithOwner) {
      setAliasError("Alias cannot be the current repository name.");
      return;
    }
    setAliasBusy(true);
    setAliasError("");
    try {
      const result = await addRepoAlias(repo.nameWithOwner, value);
      setAliases(result.aliases);
      setAliasInput("");
      setMentionsRefreshKey((value) => value + 1);
    } catch (err) {
      setAliasError(errorMessage(err));
    } finally {
      setAliasBusy(false);
    }
  }

  async function deleteAlias(alias: string) {
    setAliasBusy(true);
    setAliasError("");
    try {
      const result = await removeRepoAlias(repo.nameWithOwner, alias);
      setAliases(result.aliases);
      setMentionsRefreshKey((value) => value + 1);
    } catch (err) {
      setAliasError(errorMessage(err));
    } finally {
      setAliasBusy(false);
    }
  }

  // Derived values used by the chrome (summary/stats/grid) and the tab-bar counts.
  const repoIssuesCount = issues.filter(
    (issue) => issue.repository.nameWithOwner === repo.nameWithOwner,
  ).length;
  const repoPullRequestsCount = pullRequests.filter(
    (pr) => pr.repository.nameWithOwner === repo.nameWithOwner,
  ).length;
  const language = repo.primaryLanguage?.name || "";
  const description = details?.meta?.description ?? repo.description ?? "No description";
  const topics = details?.meta?.topics || [];
  const contributors = details?.contributors || [];
  const languages = Object.entries(details?.languages || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const releases = details?.releases ?? [];
  const workflows = details?.workflows ?? [];
  const repoDigest = details?.digest ?? null;
  const referrers = trafficDetails?.referrers ?? [];
  const popularPaths = trafficDetails?.paths ?? [];
  const mentionsCount = mentionIssues.length + mentionCode.length;
  const detailTabs = [
    {
      key: "overview" as const,
      label: "Overview",
      count: contributors.length + languages.length + (repoDigest ? 1 : 0),
    },
    { key: "actions" as const, label: "Actions", count: workflows.length },
    { key: "pull-requests" as const, label: "PRs", count: repoPullRequestsCount },
    { key: "issues" as const, label: "Issues", count: repoIssuesCount },
    { key: "releases" as const, label: "Releases", count: releases.length },
    { key: "forks" as const, label: "Forks", count: repo.forkCount },
    { key: "traffic" as const, label: "Traffic", count: referrers.length + popularPaths.length },
    { key: "mentions" as const, label: "Mentions", count: mentionsCount + aliases.length },
    { key: "dependents" as const, label: "Dependents", count: dependents.length },
  ];

  return (
    <div className="modal-root">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-close; keyboard users close via the visible Close button */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click-to-close; keyboard users close via the visible Close button */}
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal repo-detail-modal" role="dialog" aria-modal="true">
        <header className="modal-head">
          <div className="modal-title">
            <span className="modal-icon repository">R</span>
            <div style={{ minWidth: 0 }}>
              <div className="kind">Repository</div>
              <h3>{repo.nameWithOwner}</h3>
            </div>
          </div>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>

        <div className="modal-body repo-detail-body">
          {error ? <div className="modal-error">{error}</div> : null}
          <section className="repo-detail-summary">
            <div className="repo-detail-title-row">
              <a className="repo-detail-title" href={repo.url} target="_blank" rel="noreferrer">
                {repo.nameWithOwner}
              </a>
              <div className="repo-badges">
                {repo.isPrivate ? (
                  <span className="rb private">Private</span>
                ) : (
                  <span className="rb">Public</span>
                )}
                {repo.isArchived ? <span className="rb archived">Archived</span> : null}
                {repo.isFork ? <span className="rb fork">Fork</span> : null}
              </div>
            </div>
            <p>{description}</p>
            {topics.length ? (
              <div className="repo-detail-topics">
                {topics.slice(0, 8).map((topic) => (
                  <span key={topic}>{topic}</span>
                ))}
              </div>
            ) : null}
          </section>

          <section className="repo-detail-stats" aria-label="Repository stats">
            <div className="repo-detail-stat">
              <StarIcon />
              <span>Stars</span>
              <strong>{formatNumber(repo.stargazerCount)}</strong>
            </div>
            <div className="repo-detail-stat">
              <ForkIcon />
              <span>Forks</span>
              <strong>{formatNumber(repo.forkCount)}</strong>
            </div>
            <button
              type="button"
              className="repo-detail-stat action"
              onClick={() => onIssuesClick(repo.nameWithOwner)}
            >
              <IssueIcon />
              <span>Open issues</span>
              <strong>{formatNumber(issueCountForRepo(issues, repo.nameWithOwner))}</strong>
            </button>
          </section>

          <section className="repo-detail-grid">
            <div>
              <div className="repo-detail-label">Owner</div>
              <div className="repo-detail-value">{repo.owner.login}</div>
            </div>
            <div>
              <div className="repo-detail-label">Language</div>
              <div className="repo-detail-value">
                {language ? (
                  <>
                    <span className="lang-dot" style={{ background: getLanguageColor(language) }} />
                    {language}
                  </>
                ) : (
                  "None"
                )}
              </div>
            </div>
            <div>
              <div className="repo-detail-label">Last push</div>
              <div className="repo-detail-value" title={new Date(repo.pushedAt).toLocaleString()}>
                {formatRelativeTime(repo.pushedAt)}
              </div>
            </div>
            <div>
              <div className="repo-detail-label">Last update</div>
              <div className="repo-detail-value" title={new Date(repo.updatedAt).toLocaleString()}>
                {formatRelativeTime(repo.updatedAt)}
              </div>
            </div>
            {details?.meta?.license?.name ? (
              <div>
                <div className="repo-detail-label">License</div>
                <div className="repo-detail-value">{details.meta.license.name}</div>
              </div>
            ) : null}
            {details?.meta?.default_branch ? (
              <div>
                <div className="repo-detail-label">Default branch</div>
                <div className="repo-detail-value">{details.meta.default_branch}</div>
              </div>
            ) : null}
          </section>

          <nav className="repo-detail-tabs" aria-label="Repository detail sections">
            {detailTabs.map((item) => (
              <button
                type="button"
                key={item.key}
                className={`repo-detail-tab ${activeTab === item.key ? "active" : ""}`}
                aria-current={activeTab === item.key ? "page" : undefined}
                onClick={() => onTabChange(item.key)}
              >
                <span>{item.label}</span>
                <strong>
                  {loading && item.key !== "overview" && item.count === 0
                    ? "..."
                    : formatNumber(item.count)}
                </strong>
              </button>
            ))}
          </nav>

          {activeTab === "overview" ? (
            <OverviewPanel
              key={repo.nameWithOwner}
              repo={repo}
              details={details}
              loading={loading}
            />
          ) : null}
          {activeTab === "mentions" ? (
            <MentionsPanel
              key={repo.nameWithOwner}
              mentionIssues={mentionIssues}
              mentionCode={mentionCode}
              aliases={aliases}
              aliasInput={aliasInput}
              aliasError={aliasError}
              aliasBusy={aliasBusy}
              loading={loading}
              onAliasInputChange={setAliasInput}
              onSubmitAlias={() => void submitAlias()}
              onDeleteAlias={(alias) => void deleteAlias(alias)}
            />
          ) : null}
          {activeTab === "actions" ? (
            <ActionsPanel key={repo.nameWithOwner} details={details} loading={loading} />
          ) : null}
          {activeTab === "traffic" ? (
            <TrafficPanel
              key={repo.nameWithOwner}
              details={details}
              trafficDetails={trafficDetails}
            />
          ) : null}
          {activeTab === "releases" ? (
            <ReleasesPanel key={repo.nameWithOwner} details={details} loading={loading} />
          ) : null}
          {activeTab === "pull-requests" ? (
            <PullRequestsPanel key={repo.nameWithOwner} repo={repo} pullRequests={pullRequests} />
          ) : null}
          {activeTab === "forks" ? <ForksPanel key={repo.nameWithOwner} repo={repo} /> : null}
          {activeTab === "dependents" ? (
            <DependentsPanel key={repo.nameWithOwner} dependents={dependents} loading={loading} />
          ) : null}
          {activeTab === "issues" ? (
            <IssuesPanel key={repo.nameWithOwner} repo={repo} issues={issues} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
