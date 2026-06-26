import { useEffect, useState } from "react";
import { LuEye, LuRefreshCw, LuSettings } from "react-icons/lu";
import { useSearchParams } from "react-router-dom";
import { openLocalRepo } from "../../api/github";
import { useI18n } from "../../i18n/I18nProvider";
import type { TranslationKey } from "../../i18n/translations";
import type { LocalRepo, LocalReposConfig } from "../../types/github";
import { formatNumber, formatRelativeTime } from "../../utils/format";
import { arrangeLocalRepos, type LocalSort } from "../../utils/localRepos";
import { SortSelect } from "../common/SortSelect";
import { LocalDiskUsage } from "./LocalDiskUsage";
import { LocalRepoCard } from "./LocalRepoCard";
import { LocalRepoRow } from "./LocalRepoRow";
import type { RepoDensity, RepoLayout } from "./ReposView";
import { RepoViewControls } from "./RepoViewControls";

/** Local tab offers a disk-usage chart in addition to the shared grid/list. */
const LOCAL_LAYOUT_OPTIONS: RepoLayout[] = ["grid", "list", "disk"];

/** Sort options offered in the Local-tab dropdown, in menu order. */
const SORT_OPTIONS: ReadonlyArray<{ value: LocalSort; label: TranslationKey }> = [
  { value: "committed_desc", label: "local.sortRecentlyCommitted" },
  { value: "committed_asc", label: "local.sortLeastRecentlyCommitted" },
  { value: "name_asc", label: "local.sortName" },
  { value: "owner_asc", label: "local.sortOwner" },
  { value: "stars_desc", label: "local.sortMostStars" },
  { value: "size_desc", label: "local.sortLargest" },
  { value: "size_asc", label: "local.sortSmallest" },
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
  /** Move a repo cluster to the Trash. `memberPaths` are all checkout paths to drop
   *  optimistically; `force` deletes an unsafe repo. Used by the disk-usage view. */
  onDelete: (path: string, memberPaths: string[], force: boolean) => Promise<void>;
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
  onDelete,
}: LocalReposViewProps) {
  const { language, t } = useI18n();
  const [searchParams] = useSearchParams();
  // Set when arriving from a repo card's clone badge: nameWithOwner to highlight.
  const focusName = searchParams.get("localFocus")?.toLowerCase() ?? null;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rootsDraft, setRootsDraft] = useState("");
  const [ttlDraft, setTtlDraft] = useState("15");

  // Seed the settings drafts from config whenever it (re)loads.
  useEffect(() => {
    if (config) {
      setRootsDraft(config.scanRoots.join("\n"));
      setTtlDraft(String(config.sizeCacheTtlMinutes));
    }
  }, [config]);

  const saveRoots = () => {
    const scanRoots = rootsDraft
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    // Server clamps a non-positive/NaN TTL back to the default, so passing the raw
    // parse is safe; only send a finite number.
    const ttl = Number(ttlDraft);
    onSaveConfig({
      scanRoots,
      ...(Number.isFinite(ttl) ? { sizeCacheTtlMinutes: ttl } : {}),
    });
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
        </div>
        <div className="local-toolbar-actions">
          <RepoViewControls
            layout={layout}
            density={density}
            onLayoutChange={onLayoutChange}
            onCycleDensity={onCycleDensity}
            layoutOptions={LOCAL_LAYOUT_OPTIONS}
          />
          <SortSelect
            id="local-sort"
            value={sort}
            options={SORT_OPTIONS}
            onChange={(value) => onSortChange(value as LocalSort)}
          />
          <button
            type="button"
            className="btn icon-btn tip"
            data-tip={t("local.manage")}
            aria-label={t("local.manage")}
            onClick={() => setSettingsOpen((v) => !v)}
          >
            <LuSettings size={15} />
          </button>
          {scannedAt ? (
            <span className="local-scanned-at">
              {t("local.scannedAt", {
                time: formatRelativeTime(scannedAt, Date.now(), language),
              })}
            </span>
          ) : null}
          <button
            type="button"
            className="btn icon-btn tip"
            data-tip={t("local.rescan")}
            aria-label={t("local.rescan")}
            disabled={loading}
            onClick={onRescan}
          >
            <LuRefreshCw size={15} className={loading ? "spin" : ""} />
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
          <label htmlFor="local-size-ttl">{t("local.sizeCacheTtl")}</label>
          <input
            id="local-size-ttl"
            className="local-ttl-input"
            type="number"
            min={1}
            value={ttlDraft}
            onChange={(e) => setTtlDraft(e.target.value)}
          />
          <div className="local-settings-hint">{t("local.sizeCacheTtlHint")}</div>

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
                      className="btn icon-btn tip local-unhide-btn"
                      data-tip={t("local.unhide")}
                      aria-label={t("local.unhide")}
                      onClick={() => onUnhide(path)}
                    >
                      <LuEye size={14} />
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

      {layout === "disk" ? (
        <LocalDiskUsage
          repos={repos}
          onReveal={(path) => void openLocalRepo(path, "finder")}
          onDelete={onDelete}
        />
      ) : (
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
      )}
    </div>
  );
}
