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
import { LanguageIcon } from "../common/LanguageIcon";
import { GitStatusPills } from "./GitStatusPills";
import { statusLabelKey, statusTitleKey, worktreeTooltip } from "./localRepoHelpers";
import { useLocalRepoActions } from "./useLocalRepoActions";

export function LocalRepoCard({
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
  const { actionError, onContextMenu, onViewHistory } = useLocalRepoActions(repo);
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
        {repo.branch ? (
          <span className="local-branch">
            <LuGitBranch size={11} aria-hidden /> {repo.branch}
          </span>
        ) : null}
        <GitStatusPills repo={repo} />
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
        {repo.sizeBytes != null ? (
          <span className="rc-stat local-size tip" data-tip={t("local.sizeOnDisk")}>
            <LuHardDrive size={12} aria-hidden /> {formatBytes(repo.sizeBytes)}
          </span>
        ) : null}
        {primaryLanguage ? (
          <span className="rc-lang" role="img" aria-label={primaryLanguage} title={primaryLanguage}>
            <LanguageIcon name={primaryLanguage} />
          </span>
        ) : null}
        {repo.lastCommit ? (
          <button
            type="button"
            className="local-committed local-history-btn tip"
            data-tip={t("history.viewHistory")}
            onClick={onViewHistory}
          >
            <LuClock size={12} aria-hidden />{" "}
            {formatRelativeTime(repo.lastCommit.date, Date.now(), language)}
          </button>
        ) : null}
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
    </article>
  );
}
