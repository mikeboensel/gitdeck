import { useEffect, useRef } from "react";
import {
  LuClock,
  LuEyeOff,
  LuFolderGit2,
  LuGitBranch,
  LuGlobe,
  LuHardDrive,
  LuLock,
  LuPickaxe,
  LuTreePine,
} from "react-icons/lu";
import { useI18n } from "../../i18n/I18nProvider";
import type { LocalRepo } from "../../types/github";
import { formatBytes, formatNumber, formatRelativeTime } from "../../utils/format";
import { ForkIcon, StarIcon } from "../common/Icons";
import { GitStatusPills } from "./GitStatusPills";
import { statusLabelKey, statusTitleKey, worktreeTooltip } from "./localRepoHelpers";
import { useLocalRepoActions } from "./useLocalRepoActions";

/**
 * Dense one-row-per-repo layout for the Local tab's List mode — mirrors the
 * Repositories `RepoList` row (shared `.data-row`/`.repo-row` grid + density
 * vars) but carries local git facts: branch, working-tree status, worktree
 * count and last commit. The full path lives in the row's hover title.
 */
export function LocalRepoRow({
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
  const { actionError, onContextMenu, onViewHistory } = useLocalRepoActions(repo);
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
        {repo.branch ? (
          <span className="local-branch local-row-branch">
            <LuGitBranch size={11} aria-hidden /> {repo.branch}
          </span>
        ) : null}
        {repo.isWorktree ? (
          <span className="rb local-worktree-badge">{t("local.worktree")}</span>
        ) : null}
        {actionError ? (
          <span className="local-action-error" role="alert">
            {actionError}
          </span>
        ) : null}
      </div>
      <div className="repo-row-stats">
        <GitStatusPills repo={repo} />
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
        {repo.sizeBytes != null ? (
          <span className="rc-stat local-size tip" data-tip={t("local.sizeOnDisk")}>
            <LuHardDrive size={12} aria-hidden /> {formatBytes(repo.sizeBytes)}
          </span>
        ) : null}
        {repo.lastCommit ? (
          <button
            type="button"
            className="repo-row-pushed local-committed local-history-btn tip"
            data-tip={t("history.viewHistory")}
            onClick={onViewHistory}
          >
            <LuClock size={12} aria-hidden />{" "}
            {formatRelativeTime(repo.lastCommit.date, Date.now(), language)}
          </button>
        ) : (
          <span className="repo-row-pushed local-committed">-</span>
        )}
        <button
          type="button"
          className="local-hide-btn tip"
          data-tip={t("local.hide")}
          aria-label={t("local.hide")}
          onClick={() => onHide(repo.path)}
        >
          <LuEyeOff size={14} aria-hidden />
        </button>
      </div>
    </div>
  );
}
