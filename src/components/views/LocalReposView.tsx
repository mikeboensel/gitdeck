import { type MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from "react";
import type { IconType } from "react-icons";
import {
  LuArrowDownUp,
  LuCircleCheck,
  LuFilePen,
  LuFilePlus,
  LuFileQuestion,
  LuFolderGit2,
  LuGlobe,
  LuLock,
  LuPickaxe,
  LuRefreshCw,
  LuRotateCcw,
  LuTreePine,
  LuTriangleAlert,
} from "react-icons/lu";
import { useSearchParams } from "react-router-dom";
import { openLocalRepo } from "../../api/github";
import { useRightClickMenu } from "../../contexts/RightClickMenuProvider";
import { useI18n } from "../../i18n/I18nProvider";
import type { TranslationKey } from "../../i18n/translations";
import { buildLocalRepoMenu } from "../../menus/localRepoMenu";
import type { GitChangeCounts, LocalRepo, LocalReposConfig } from "../../types/github";
import { errorMessage } from "../../utils/errors";
import { formatNumber, formatRelativeTime } from "../../utils/format";
import { arrangeLocalRepos, type LocalSort } from "../../utils/localRepos";
import { ForkIcon, StarIcon } from "../common/Icons";
import { LanguageIcon } from "../common/LanguageIcon";
import type { RepoDensity, RepoLayout } from "./ReposView";
import { RepoViewControls } from "./RepoViewControls";

/** Sort options offered in the Local-tab dropdown, in menu order. */
const SORT_OPTIONS: ReadonlyArray<{ value: LocalSort; label: TranslationKey }> = [
  { value: "committed_desc", label: "local.sortRecentlyCommitted" },
  { value: "committed_asc", label: "local.sortLeastRecentlyCommitted" },
  { value: "name_asc", label: "local.sortName" },
  { value: "owner_asc", label: "local.sortOwner" },
  { value: "stars_desc", label: "local.sortMostStars" },
  { value: "dirty_first", label: "local.sortDirtyFirst" },
  { value: "status_asc", label: "local.sortStatus" },
];

interface LocalReposViewProps {
  /** Repos already filtered by the FacetSidebar selection. */
  repos: LocalRepo[];
  /** Unfiltered total, for the header. */
  totalCount: number;
  scannedAt: string | null;
  loading: boolean;
  error?: string;
  config: LocalReposConfig | null;
  /** Card grid/list + density, shared with the Repositories tab. */
  layout: RepoLayout;
  density: RepoDensity;
  sort: LocalSort;
  onLayoutChange: (layout: RepoLayout) => void;
  onCycleDensity: () => void;
  onSortChange: (sort: LocalSort) => void;
  onRescan: () => void;
  onSaveConfig: (updates: Partial<LocalReposConfig>) => void;
  onHide: (path: string) => void;
  onUnhide: (path: string) => void;
}

export function LocalReposView({
  repos,
  totalCount,
  scannedAt,
  loading,
  error,
  config,
  layout,
  density,
  sort,
  onLayoutChange,
  onCycleDensity,
  onSortChange,
  onRescan,
  onSaveConfig,
  onHide,
  onUnhide,
}: LocalReposViewProps) {
  const { language, t } = useI18n();
  const [searchParams] = useSearchParams();
  // Set when arriving from a repo card's clone badge: nameWithOwner to highlight.
  const focusName = searchParams.get("localFocus")?.toLowerCase() ?? null;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rootsDraft, setRootsDraft] = useState("");

  // Seed the scan-roots textarea from config whenever it (re)loads.
  useEffect(() => {
    if (config) setRootsDraft(config.scanRoots.join("\n"));
  }, [config]);

  const saveRoots = () => {
    const scanRoots = rootsDraft
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    onSaveConfig({ scanRoots });
  };

  const filtered = repos.length !== totalCount;
  const units = arrangeLocalRepos(repos, sort);
  const hidden = config?.denylist ?? [];

  return (
    <div className="view-local" style={{ display: "block" }}>
      <div className="local-toolbar">
        <div className="local-toolbar-info">
          <strong>
            {filtered
              ? t("local.reposFiltered", {
                  count: formatNumber(repos.length),
                  total: formatNumber(totalCount),
                })
              : t("local.reposFound", { count: formatNumber(totalCount) })}
          </strong>
          {scannedAt ? (
            <span className="local-scanned-at">
              {t("local.scannedAt", {
                time: formatRelativeTime(scannedAt, Date.now(), language),
              })}
            </span>
          ) : null}
        </div>
        <div className="local-toolbar-actions">
          <RepoViewControls
            layout={layout}
            density={density}
            onLayoutChange={onLayoutChange}
            onCycleDensity={onCycleDensity}
          />
          <label htmlFor="local-sort" className="sort-label" title={t("common.sort")}>
            <LuArrowDownUp size={14} aria-label={t("common.sort")} />
          </label>
          <select
            id="local-sort"
            className="sort"
            value={sort}
            onChange={(event) => onSortChange(event.target.value as LocalSort)}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.label)}
              </option>
            ))}
          </select>
          <button type="button" className="btn" onClick={() => setSettingsOpen((v) => !v)}>
            {t("local.manage")}
          </button>
          <button type="button" className="btn" disabled={loading} onClick={onRescan}>
            <LuRefreshCw size={13} className={loading ? "spin" : ""} /> {t("local.rescan")}
          </button>
        </div>
      </div>

      {settingsOpen ? (
        <div className="local-settings">
          <label htmlFor="local-scan-roots">{t("local.scanRoots")}</label>
          <textarea
            id="local-scan-roots"
            className="local-roots-input"
            value={rootsDraft}
            placeholder={t("local.scanRootsPlaceholder")}
            onChange={(e) => setRootsDraft(e.target.value)}
            rows={3}
          />
          <div className="local-settings-actions">
            <button type="button" className="btn primary" onClick={saveRoots}>
              {t("local.saveAndRescan")}
            </button>
          </div>

          {hidden.length ? (
            <div className="local-hidden">
              <div className="local-hidden-head">
                {t("local.hiddenRepos")}
                <span className="tab-badge">{hidden.length}</span>
              </div>
              <ul className="local-hidden-list">
                {hidden.map((path) => (
                  <li key={path} className="local-hidden-row">
                    <span className="local-hidden-path" title={path}>
                      {path}
                    </span>
                    <button
                      type="button"
                      className="btn local-unhide-btn"
                      onClick={() => onUnhide(path)}
                    >
                      <LuRotateCcw size={13} /> {t("local.unhide")}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <div className="local-error">{error}</div> : null}

      {!repos.length && !loading ? (
        <div className="empty">
          <div className="big">{t("local.emptyTitle")}</div>
          <div>{t("local.emptyText")}</div>
        </div>
      ) : null}

      <div className="repos-view local-collection" data-layout={layout} data-density={density}>
        {layout === "list" ? (
          <div className="data-list repo-list local-list">
            {units.map((unit) => (
              // Linked worktrees no longer get their own rows — the primary row
              // carries a worktree count + tooltip instead.
              <LocalRepoRow
                key={unit.key}
                repo={unit.primary}
                worktrees={unit.worktrees}
                onHide={onHide}
                highlighted={
                  focusName != null && unit.primary.nameWithOwner?.toLowerCase() === focusName
                }
              />
            ))}
          </div>
        ) : (
          <div className="local-cards">
            {units.map((unit) => (
              // Linked worktrees no longer get their own cards — the primary card
              // carries a worktree count + tooltip instead (see LocalRepoCard).
              <LocalRepoCard
                key={unit.key}
                repo={unit.primary}
                worktrees={unit.worktrees}
                onHide={onHide}
                highlighted={
                  focusName != null && unit.primary.nameWithOwner?.toLowerCase() === focusName
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function statusLabelKey(status: LocalRepo["enrichmentStatus"]) {
  switch (status) {
    case "enriched":
      return "local.statusEnriched";
    case "unreachable":
      return "local.statusUnreachable";
    case "no-remote":
      return "local.statusNoRemote";
    default:
      return "local.statusLocalOnly";
  }
}

/**
 * Working-tree change categories, in display order (most urgent first). Each
 * renders as its own pill when its count is non-zero; the label is count-prefixed
 * and the title carries the full explanation.
 */
const CHANGE_PILLS: ReadonlyArray<{
  field: keyof GitChangeCounts;
  cls: string;
  icon: IconType;
  label: TranslationKey;
  title: TranslationKey;
}> = [
  {
    field: "conflicted",
    cls: "conflicted",
    icon: LuTriangleAlert,
    label: "local.changeConflicted",
    title: "local.changeConflictedTitle",
  },
  {
    field: "staged",
    cls: "staged",
    icon: LuFilePlus,
    label: "local.changeStaged",
    title: "local.changeStagedTitle",
  },
  {
    field: "modified",
    cls: "modified",
    icon: LuFilePen,
    label: "local.changeModified",
    title: "local.changeModifiedTitle",
  },
  {
    field: "untracked",
    cls: "untracked",
    icon: LuFileQuestion,
    label: "local.changeUntracked",
    title: "local.changeUntrackedTitle",
  },
];

/** Longer hover explainer for the enrichment-status pickaxe badge. */
function statusTitleKey(status: LocalRepo["enrichmentStatus"]) {
  switch (status) {
    case "enriched":
      return "local.statusEnrichedTitle";
    case "unreachable":
      return "local.statusUnreachableTitle";
    case "no-remote":
      return "local.statusNoRemoteTitle";
    default:
      return "local.statusLocalOnlyTitle";
  }
}

/** Worktree tooltip: a count header, then one line per worktree (branch + dirty marker). */
function worktreeTooltip(worktrees: LocalRepo[], t: ReturnType<typeof useI18n>["t"]): string {
  if (worktrees.length === 0) return "";
  return [
    t("local.worktreeCount", { count: String(worktrees.length) }),
    ...worktrees.map((w) => `• ${w.branch ?? "(detached)"}${w.dirty ? " *" : ""}`),
  ].join("\n");
}

/**
 * Shared "open natively / right-click menu" wiring for the card and row variants:
 * a transient open-error message plus the context-menu handler. Keeps both
 * variants in sync without duplicating the Finder/Cursor plumbing.
 */
function useLocalRepoActions(repo: LocalRepo): {
  actionError: string;
  onContextMenu: (event: ReactMouseEvent) => void;
} {
  const { t } = useI18n();
  const { open } = useRightClickMenu();
  // Transient feedback when a native "open" (Finder/Cursor) fails, e.g. Cursor
  // isn't installed. Clears itself a few seconds after it's shown.
  const [actionError, setActionError] = useState("");
  useEffect(() => {
    if (!actionError) return;
    const id = setTimeout(() => setActionError(""), 4000);
    return () => clearTimeout(id);
  }, [actionError]);

  const runOpen = (target: "finder" | "cursor") => {
    setActionError("");
    openLocalRepo(repo.path, target).catch((err: unknown) => {
      setActionError(`${t("local.openFailed")}: ${errorMessage(err)}`);
    });
  };

  const onContextMenu = (event: ReactMouseEvent) =>
    open(event, {
      ariaLabel: repo.name,
      items: buildLocalRepoMenu(
        repo,
        { onReveal: () => runOpen("finder"), onOpenInCursor: () => runOpen("cursor") },
        t,
      ),
    });

  return { actionError, onContextMenu };
}

function LocalRepoCard({
  repo,
  worktrees,
  onHide,
  highlighted,
}: {
  repo: LocalRepo;
  /** Linked worktrees sharing this repo's git dir; surfaced as a count + tooltip. */
  worktrees: LocalRepo[];
  onHide: (path: string) => void;
  highlighted: boolean;
}) {
  const { language, t } = useI18n();
  const { actionError, onContextMenu } = useLocalRepoActions(repo);
  const enrich = repo.enrichment;
  const primaryLanguage = enrich?.primaryLanguage?.name;
  const worktreeTip = worktreeTooltip(worktrees, t);
  const cardRef = useRef<HTMLElement>(null);
  // Scroll the targeted clone into view when navigated to from a repo card.
  useEffect(() => {
    if (highlighted) cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlighted]);

  return (
    <article
      ref={cardRef}
      className={`repo-card local-card${highlighted ? " local-card-focused" : ""}${
        repo.isWorktree ? " local-card-worktree" : ""
      }`}
      onContextMenu={onContextMenu}
    >
      <div className="rc-head">
        <LuFolderGit2 size={20} className="local-card-icon" />
        <div className="rc-title">
          {enrich ? (
            <a href={enrich.url} target="_blank" rel="noreferrer">
              {repo.name}
            </a>
          ) : (
            <span>{repo.name}</span>
          )}
        </div>
        <div className="repo-badges">
          {repo.isWorktree ? (
            <span className="rb local-worktree-badge">{t("local.worktree")}</span>
          ) : null}
          {enrich ? (
            enrich.isPrivate ? (
              <span className="rb rb-icon private" role="img" aria-label={t("repo.private")}>
                <LuLock size={11} />
              </span>
            ) : (
              <span className="rb rb-icon" role="img" aria-label={t("repo.public")}>
                <LuGlobe size={11} />
              </span>
            )
          ) : null}
          <span
            className={`rb rb-icon tip local-status local-status-${repo.enrichmentStatus}`}
            role="img"
            aria-label={t(statusLabelKey(repo.enrichmentStatus))}
            data-tip={t(statusTitleKey(repo.enrichmentStatus))}
          >
            <LuPickaxe size={11} />
          </span>
        </div>
      </div>

      <div className="local-path" title={repo.path}>
        {repo.path}
      </div>

      <div className="local-git-row">
        {repo.branch ? <span className="local-branch">{repo.branch}</span> : null}
        <div className="local-git-status">
          {repo.dirty ? (
            CHANGE_PILLS.filter((p) => repo.changes[p.field] > 0).map((p) => (
              <span
                key={p.field}
                className={`local-pill dirty ${p.cls} tip`}
                role="img"
                data-tip={`${repo.changes[p.field]} ${t(p.label)} — ${t(p.title)}`}
                aria-label={`${repo.changes[p.field]} ${t(p.label)}`}
              >
                <p.icon size={11} aria-hidden /> {repo.changes[p.field]}
              </span>
            ))
          ) : (
            <span
              className="local-pill clean tip"
              role="img"
              data-tip={`${t("local.clean")} — ${t("local.cleanTitle")}`}
              aria-label={t("local.clean")}
            >
              <LuCircleCheck size={11} aria-hidden /> {t("local.clean")}
            </span>
          )}
          {repo.ahead > 0 ? <span className="local-pill">↑{repo.ahead}</span> : null}
          {repo.behind > 0 ? <span className="local-pill">↓{repo.behind}</span> : null}
        </div>
      </div>

      {actionError ? (
        <div className="local-action-error" role="alert">
          {actionError}
        </div>
      ) : null}

      {enrich?.description ? <div className="repo-desc">{enrich.description}</div> : null}

      <div className="rc-stats">
        {enrich ? (
          <>
            <span className="rc-stat strong star">
              <StarIcon /> {formatNumber(enrich.stargazerCount)}
            </span>
            <span className="rc-stat strong fork">
              <ForkIcon /> {formatNumber(enrich.forkCount)}
            </span>
          </>
        ) : null}
        {worktrees.length > 0 ? (
          <span
            className="rc-stat strong worktrees tip"
            role="img"
            aria-label={t("local.worktreeCount", { count: String(worktrees.length) })}
            data-tip={worktreeTip}
          >
            <LuTreePine size={13} /> {worktrees.length}
          </span>
        ) : null}
        {primaryLanguage ? (
          <span className="rc-lang" role="img" aria-label={primaryLanguage} title={primaryLanguage}>
            <LanguageIcon name={primaryLanguage} />
          </span>
        ) : null}
        {repo.lastCommit ? (
          <span>
            {t("local.committed", {
              time: formatRelativeTime(repo.lastCommit.date, Date.now(), language),
            })}
          </span>
        ) : null}
        <button
          type="button"
          className="local-hide-btn"
          onClick={() => onHide(repo.path)}
          title={t("local.hide")}
        >
          {t("local.hide")}
        </button>
      </div>
    </article>
  );
}

/** The dirty/clean + ahead/behind pills, shared by the card and the compact row. */
function GitStatusPills({ repo }: { repo: LocalRepo }) {
  const { t } = useI18n();
  return (
    <div className="local-git-status">
      {repo.dirty ? (
        CHANGE_PILLS.filter((p) => repo.changes[p.field] > 0).map((p) => (
          <span
            key={p.field}
            className={`local-pill dirty ${p.cls} tip`}
            role="img"
            data-tip={`${repo.changes[p.field]} ${t(p.label)} — ${t(p.title)}`}
            aria-label={`${repo.changes[p.field]} ${t(p.label)}`}
          >
            <p.icon size={11} aria-hidden /> {repo.changes[p.field]}
          </span>
        ))
      ) : (
        <span className="local-pill clean">{t("local.clean")}</span>
      )}
      {repo.ahead > 0 ? <span className="local-pill">↑{repo.ahead}</span> : null}
      {repo.behind > 0 ? <span className="local-pill">↓{repo.behind}</span> : null}
    </div>
  );
}

/**
 * Dense one-row-per-repo layout for the Local tab's List mode — mirrors the
 * Repositories `RepoList` row (shared `.data-row`/`.repo-row` grid + density
 * vars) but carries local git facts: branch, working-tree status, worktree
 * count and last commit. The full path lives in the row's hover title.
 */
function LocalRepoRow({
  repo,
  worktrees,
  onHide,
  highlighted,
}: {
  repo: LocalRepo;
  worktrees: LocalRepo[];
  onHide: (path: string) => void;
  highlighted: boolean;
}) {
  const { language, t } = useI18n();
  const { actionError, onContextMenu } = useLocalRepoActions(repo);
  const enrich = repo.enrichment;
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (highlighted) rowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlighted]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the row only adds a contextmenu (right-click) enhancement; every primary action is a nested focusable control (repo link, hide button).
    <div
      ref={rowRef}
      className={`data-row repo-row local-row${highlighted ? " local-card-focused" : ""}`}
      title={repo.path}
      onContextMenu={onContextMenu}
    >
      <span className="local-row-icon" aria-hidden>
        <LuFolderGit2 size={16} />
      </span>
      <div className="repo-row-main">
        <div className="repo-row-title">
          {enrich ? (
            <a href={enrich.url} target="_blank" rel="noreferrer">
              {repo.name}
            </a>
          ) : (
            <span>{repo.name}</span>
          )}
        </div>
        {repo.branch ? <span className="local-branch local-row-branch">{repo.branch}</span> : null}
        {repo.isWorktree ? (
          <span className="rb local-worktree-badge">{t("local.worktree")}</span>
        ) : null}
        <GitStatusPills repo={repo} />
        {actionError ? (
          <span className="local-action-error" role="alert">
            {actionError}
          </span>
        ) : null}
      </div>
      <div className="repo-row-stats">
        <span className="repo-row-flags">
          {enrich ? (
            enrich.isPrivate ? (
              <span className="rb rb-icon private" role="img" aria-label={t("repo.private")}>
                <LuLock size={11} />
              </span>
            ) : (
              <span className="rb rb-icon" role="img" aria-label={t("repo.public")}>
                <LuGlobe size={11} />
              </span>
            )
          ) : null}
          <span
            className={`rb rb-icon tip local-status local-status-${repo.enrichmentStatus}`}
            role="img"
            aria-label={t(statusLabelKey(repo.enrichmentStatus))}
            data-tip={t(statusTitleKey(repo.enrichmentStatus))}
          >
            <LuPickaxe size={11} />
          </span>
        </span>
        {enrich ? (
          <>
            <span className="rc-stat strong star">
              <StarIcon /> {formatNumber(enrich.stargazerCount)}
            </span>
            <span className="rc-stat strong fork">
              <ForkIcon /> {formatNumber(enrich.forkCount)}
            </span>
          </>
        ) : null}
        {worktrees.length > 0 ? (
          <span
            className="rc-stat strong worktrees tip"
            role="img"
            aria-label={t("local.worktreeCount", { count: String(worktrees.length) })}
            data-tip={worktreeTooltip(worktrees, t)}
          >
            <LuTreePine size={13} /> {worktrees.length}
          </span>
        ) : null}
        <span className="repo-row-pushed">
          {repo.lastCommit
            ? t("local.committed", {
                time: formatRelativeTime(repo.lastCommit.date, Date.now(), language),
              })
            : "-"}
        </span>
        <button
          type="button"
          className="local-hide-btn"
          onClick={() => onHide(repo.path)}
          title={t("local.hide")}
        >
          {t("local.hide")}
        </button>
      </div>
    </div>
  );
}
