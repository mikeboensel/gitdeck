import {
  LuArchive,
  LuBook,
  LuBuilding2,
  LuEraser,
  LuEye,
  LuFileCode2,
  LuGitFork,
  LuGlobe,
  LuLayers,
  LuLock,
  LuPenLine,
  LuSlidersHorizontal,
  LuTag,
  LuUserCheck,
  LuUsers,
} from "react-icons/lu";
import { useI18n } from "../i18n/I18nProvider";
import type { IssueFilters, PullRequestFilters, RepoFilters } from "../utils/dashboard";
import { formatNumber, formatRelativeTime } from "../utils/format";
import { INBOX_MAILBOXES, type InboxMailbox } from "../utils/inbox";
import { Avatar } from "./common/Avatar";
import { CloseIcon, RefreshIcon, SearchIcon } from "./common/Icons";
import { isUnknownLanguage, LanguageIcon } from "./common/LanguageIcon";
import { CheckList, FacetChips, FilterSection, toggleSetValue } from "./sidebar/primitives";
import { SidebarShell } from "./sidebar/SidebarShell";

type Tab =
  | "inbox"
  | "issues"
  | "repos"
  | "local"
  | "kanban"
  | "insights"
  | "alerts"
  | "ci"
  | "digests"
  | "lab"
  | "prs";

export interface InboxSidebarState {
  mailbox: InboxMailbox;
  counts: Record<InboxMailbox, number>;
  totalCount: number;
  unreadCount: number;
  onMailboxChange: (mailbox: InboxMailbox) => void;
  onMarkAllRead: () => void;
}

type IssueLikeFacets = {
  orgs: Map<string, number>;
  repos: Map<string, number>;
  labels: Map<string, { count: number; color?: string }>;
  authors: Map<string, number>;
  assignees: Map<string, number>;
};

interface SidebarControlsProps {
  tab: Tab;
  search: string;
  issueFilters: IssueFilters;
  prFilters: PullRequestFilters;
  repoFilters: RepoFilters;
  issueFacets: IssueLikeFacets;
  prFacets: IssueLikeFacets;
  repoFacets: {
    orgs: Map<string, number>;
    languages: Map<string, number>;
    collaborators: Map<string, number>;
  };
  onSearchChange: (value: string) => void;
  onIssueFiltersChange: (filters: IssueFilters) => void;
  onPrFiltersChange: (filters: PullRequestFilters) => void;
  onRepoFiltersChange: (filters: RepoFilters) => void;
  onReset: () => void;
  onClose: () => void;
  onCollapse: () => void;
  authLogin?: string;
  collaboratorsFetchedAt?: string | null;
  collaboratorsLoading?: boolean;
  onRefreshCollaborators?: () => void;
  inbox?: InboxSidebarState;
}

export function SidebarControls({
  tab,
  search,
  issueFilters,
  prFilters,
  repoFilters,
  issueFacets,
  prFacets,
  repoFacets,
  onSearchChange,
  onIssueFiltersChange,
  onPrFiltersChange,
  onRepoFiltersChange,
  onReset,
  onClose,
  onCollapse,
  authLogin,
  collaboratorsFetchedAt,
  collaboratorsLoading,
  onRefreshCollaborators,
  inbox,
}: SidebarControlsProps) {
  const { t, language } = useI18n();
  const inboxMode = tab === "inbox";
  const prMode = tab === "prs";
  const issueMode = tab === "issues" || tab === "kanban";
  const ticketMode = prMode || issueMode;
  const activeFilters: IssueFilters | PullRequestFilters = prMode ? prFilters : issueFilters;
  const activeFacets: IssueLikeFacets = prMode ? prFacets : issueFacets;
  const orgSelection = ticketMode ? activeFilters.orgs : repoFilters.orgs;
  const orgEntries = ticketMode ? activeFacets.orgs : repoFacets.orgs;
  const onActiveFiltersChange = (next: IssueFilters | PullRequestFilters) => {
    if (prMode) onPrFiltersChange(next as PullRequestFilters);
    else onIssueFiltersChange(next as IssueFilters);
  };

  if (inboxMode && inbox) {
    return (
      <SidebarShell onCollapse={onCollapse}>
        <div className="side-head">
          <h2>{t("sidebar.mailboxes")}</h2>
          <span className="reset" style={{ pointerEvents: "none" }}>
            {formatNumber(inbox.totalCount)}
          </span>
          <button
            type="button"
            className="side-close"
            aria-label={t("common.closeFilters")}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </div>
        <div className="search-wrap">
          <label className="search-input">
            <SearchIcon />
            <input
              type="search"
              placeholder={t("sidebar.searchInbox")}
              autoComplete="off"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </label>
        </div>
        <div className="mailbox-list">
          {INBOX_MAILBOXES.map((entry) => {
            const count = inbox.counts[entry.key] ?? 0;
            const active = inbox.mailbox === entry.key;
            return (
              <button
                className={`mailbox-item ${active ? "active" : ""}`}
                key={entry.key}
                type="button"
                onClick={() => inbox.onMailboxChange(entry.key)}
              >
                <span>{t(`mailbox.${entry.key}`)}</span>
                <strong>{formatNumber(count)}</strong>
              </button>
            );
          })}
        </div>
        {inbox.unreadCount > 0 ? (
          <button className="mailbox-action" type="button" onClick={inbox.onMarkAllRead}>
            {t("sidebar.markAllRead", { count: formatNumber(inbox.unreadCount) })}
          </button>
        ) : null}
      </SidebarShell>
    );
  }

  return (
    <SidebarShell onCollapse={onCollapse}>
      <div className="side-head">
        <button
          type="button"
          className="reset tip"
          data-tip={t("common.clearAll")}
          aria-label={t("common.clearAll")}
          onClick={onReset}
        >
          <LuEraser size={16} />
        </button>
        <button
          type="button"
          className="side-close"
          aria-label={t("common.closeFilters")}
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>

      <div className="search-wrap">
        <label className="search-input">
          <SearchIcon />
          <input
            type="search"
            placeholder={t("sidebar.search")}
            autoComplete="off"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </label>
      </div>

      <FilterSection
        title={t("sidebar.organizations")}
        icon={<LuBuilding2 size={16} />}
        activeCount={orgSelection.size}
        onClear={() =>
          ticketMode
            ? onActiveFiltersChange({ ...activeFilters, orgs: new Set() })
            : onRepoFiltersChange({ ...repoFilters, orgs: new Set() })
        }
      >
        <FacetChips
          entries={[...orgEntries.entries()]}
          selected={orgSelection}
          userLogin={authLogin || undefined}
          renderIcon={(name) => <Avatar login={name} size={40} className="facet-chip-avatar" />}
          onToggle={(value) =>
            ticketMode
              ? onActiveFiltersChange({
                  ...activeFilters,
                  orgs: toggleSetValue(activeFilters.orgs, value),
                })
              : onRepoFiltersChange({
                  ...repoFilters,
                  orgs: toggleSetValue(repoFilters.orgs, value),
                })
          }
        />
      </FilterSection>

      {ticketMode ? (
        <>
          <FilterSection
            title={t("sidebar.repositories")}
            icon={<LuBook size={16} />}
            activeCount={activeFilters.repos.size}
            dataFor={prMode ? "prs-only" : "issues-only"}
            onClear={() => onActiveFiltersChange({ ...activeFilters, repos: new Set() })}
          >
            <CheckList
              entries={[...activeFacets.repos.entries()]}
              selected={activeFilters.repos}
              onToggle={(value) =>
                onActiveFiltersChange({
                  ...activeFilters,
                  repos: toggleSetValue(activeFilters.repos, value),
                })
              }
            />
          </FilterSection>
          <FilterSection
            title={t("sidebar.labels")}
            icon={<LuTag size={16} />}
            activeCount={activeFilters.labels.size}
            dataFor={prMode ? "prs-only" : "issues-only"}
            onClear={() => onActiveFiltersChange({ ...activeFilters, labels: new Set() })}
          >
            <CheckList
              entries={[...activeFacets.labels.entries()]}
              selected={activeFilters.labels}
              showSwatch
              onToggle={(value) =>
                onActiveFiltersChange({
                  ...activeFilters,
                  labels: toggleSetValue(activeFilters.labels, value),
                })
              }
            />
          </FilterSection>
          <FilterSection
            title={t("sidebar.authors")}
            icon={<LuPenLine size={16} />}
            activeCount={activeFilters.authors.size}
            dataFor={prMode ? "prs-only" : "issues-only"}
            onClear={() => onActiveFiltersChange({ ...activeFilters, authors: new Set() })}
          >
            <FacetChips
              entries={[...activeFacets.authors.entries()]}
              selected={activeFilters.authors}
              renderIcon={(name) => <Avatar login={name} size={40} className="facet-chip-avatar" />}
              onToggle={(value) =>
                onActiveFiltersChange({
                  ...activeFilters,
                  authors: toggleSetValue(activeFilters.authors, value),
                })
              }
            />
          </FilterSection>
          <FilterSection
            title={t("sidebar.assignees")}
            icon={<LuUserCheck size={16} />}
            activeCount={activeFilters.assignees.size}
            dataFor={prMode ? "prs-only" : "issues-only"}
            onClear={() => onActiveFiltersChange({ ...activeFilters, assignees: new Set() })}
          >
            <FacetChips
              entries={[...activeFacets.assignees.entries()]}
              selected={activeFilters.assignees}
              renderIcon={(name) => <Avatar login={name} size={40} className="facet-chip-avatar" />}
              onToggle={(value) =>
                onActiveFiltersChange({
                  ...activeFilters,
                  assignees: toggleSetValue(activeFilters.assignees, value),
                })
              }
            />
          </FilterSection>
        </>
      ) : (
        <>
          <FilterSection
            title={t("sidebar.languages")}
            icon={<LuFileCode2 size={16} />}
            activeCount={repoFilters.languages.size}
            dataFor="repos-only"
            onClear={() => onRepoFiltersChange({ ...repoFilters, languages: new Set() })}
          >
            <FacetChips
              entries={[...repoFacets.languages.entries()]}
              selected={repoFilters.languages}
              renderIcon={(name) => <LanguageIcon name={name} size={20} />}
              labelFor={(name) => (isUnknownLanguage(name) ? "Unknown" : name)}
              onToggle={(value) =>
                onRepoFiltersChange({
                  ...repoFilters,
                  languages: toggleSetValue(repoFilters.languages, value),
                })
              }
            />
          </FilterSection>
          <FilterSection
            title={t("sidebar.collaborators")}
            icon={<LuUsers size={16} />}
            activeCount={repoFilters.collaborators.size}
            dataFor="repos-only"
            onClear={() => onRepoFiltersChange({ ...repoFilters, collaborators: new Set() })}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 8,
                padding: "2px 2px 6px",
              }}
            >
              <span style={{ color: "var(--muted-2)", fontSize: 12, lineHeight: 1.4 }}>
                {t("sidebar.collaboratorsNote")}
                {collaboratorsFetchedAt ? (
                  <>
                    {" "}
                    <span style={{ whiteSpace: "nowrap" }}>
                      {t("sidebar.collaboratorsUpdated", {
                        time: formatRelativeTime(collaboratorsFetchedAt, Date.now(), language),
                      })}
                    </span>
                  </>
                ) : null}
              </span>
              {onRefreshCollaborators ? (
                <button
                  type="button"
                  className="reset tip"
                  data-tip={t("common.refresh")}
                  aria-label={t("common.refresh")}
                  disabled={collaboratorsLoading}
                  onClick={onRefreshCollaborators}
                  style={{ flexShrink: 0 }}
                >
                  <RefreshIcon />
                </button>
              ) : null}
            </div>
            <FacetChips
              entries={[...repoFacets.collaborators.entries()]}
              selected={repoFilters.collaborators}
              userLogin={authLogin || undefined}
              renderIcon={(name) => <Avatar login={name} size={40} className="facet-chip-avatar" />}
              onToggle={(value) =>
                onRepoFiltersChange({
                  ...repoFilters,
                  collaborators: toggleSetValue(repoFilters.collaborators, value),
                })
              }
            />
          </FilterSection>
          <FilterSection
            title={t("sidebar.visibility")}
            icon={<LuEye size={16} />}
            activeCount={repoFilters.visibility === "all" ? 0 : 1}
            dataFor="repos-only"
            onClear={() => onRepoFiltersChange({ ...repoFilters, visibility: "all" })}
          >
            <div className="opt-group" role="tablist">
              {(
                [
                  { value: "all", label: t("common.all"), Icon: LuLayers },
                  { value: "public", label: t("sidebar.public"), Icon: LuGlobe },
                  { value: "private", label: t("sidebar.private"), Icon: LuLock },
                ] as const
              ).map(({ value, label, Icon }) => (
                <button
                  type="button"
                  key={value}
                  className={`tip ${repoFilters.visibility === value ? "active" : ""}`}
                  data-tip={label}
                  aria-label={label}
                  onClick={() => onRepoFiltersChange({ ...repoFilters, visibility: value })}
                >
                  <Icon size={15} />
                </button>
              ))}
            </div>
          </FilterSection>
          <FilterSection
            title={t("sidebar.options")}
            icon={<LuSlidersHorizontal size={16} />}
            activeCount={Number(!repoFilters.includeForks) + Number(repoFilters.includeArchived)}
            dataFor="repos-only"
            onClear={() =>
              onRepoFiltersChange({ ...repoFilters, includeForks: true, includeArchived: false })
            }
          >
            <fieldset className="opt-group">
              <button
                type="button"
                className={`tip ${repoFilters.includeForks ? "active" : ""}`}
                data-tip={t("sidebar.includeForks")}
                aria-label={t("sidebar.includeForks")}
                aria-pressed={repoFilters.includeForks}
                onClick={() =>
                  onRepoFiltersChange({ ...repoFilters, includeForks: !repoFilters.includeForks })
                }
              >
                <LuGitFork size={15} />
              </button>
              <button
                type="button"
                className={`tip ${repoFilters.includeArchived ? "active" : ""}`}
                data-tip={t("sidebar.includeArchived")}
                aria-label={t("sidebar.includeArchived")}
                aria-pressed={repoFilters.includeArchived}
                onClick={() =>
                  onRepoFiltersChange({
                    ...repoFilters,
                    includeArchived: !repoFilters.includeArchived,
                  })
                }
              >
                <LuArchive size={15} />
              </button>
            </fieldset>
          </FilterSection>
        </>
      )}
    </SidebarShell>
  );
}
