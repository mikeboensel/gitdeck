import { LuArchive, LuClock, LuFolderGit2, LuGitFork, LuGlobe, LuLock } from "react-icons/lu";
import { useRightClickMenu } from "../../contexts/RightClickMenuProvider";
import { useI18n } from "../../i18n/I18nProvider";
import { buildRepoMenu } from "../../menus/repoMenu";
import { issueCountForRepo } from "../../utils/dashboard";
import { formatNumber, formatRelativeTime } from "../../utils/format";
import { Avatar } from "../common/Avatar";
import { ForkIcon, IssueIcon, StarIcon } from "../common/Icons";
import type { RepoViewDataProps } from "./ReposView";

/**
 * Dense one-row-per-repo layout (core fields only). Reuses the shared
 * `.data-list` / `.rc-stat` / `.rb` visual language; density is applied by the
 * `.repos-view[data-density]` ancestor via CSS variables, so there are no
 * density conditionals here.
 */
export function RepoList({
  repos,
  issues,
  localClonesByRepo,
  onRepoClick,
  onIssuesClick,
  onStarsClick,
  onForksClick,
  onLocalClick,
}: RepoViewDataProps) {
  const { language, t } = useI18n();
  const { open } = useRightClickMenu();
  if (!repos.length) {
    return (
      <div className="empty">
        <div className="big">{t("empty.reposTitle")}</div>
        <div>{t("empty.tryClearing")}</div>
      </div>
    );
  }

  return (
    <div className="data-list repo-list">
      {repos.map((repo) => {
        const issueCount = issueCountForRepo(issues, repo.nameWithOwner);
        const clonePaths = localClonesByRepo.get(repo.nameWithOwner.toLowerCase());
        const cloneCount = clonePaths?.length ?? 0;
        return (
          // biome-ignore lint/a11y/useSemanticElements: row contains nested interactive elements (repo anchor + stat buttons); a native <button> cannot wrap them, so role="button" with tabIndex/onKeyDown is used instead.
          <div
            className="data-row repo-row"
            key={repo.nameWithOwner}
            role="button"
            tabIndex={0}
            onClick={() => onRepoClick(repo)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onRepoClick(repo);
            }}
            onContextMenu={(event) =>
              open(event, {
                ariaLabel: repo.nameWithOwner,
                items: buildRepoMenu(
                  repo,
                  { onOpen: onRepoClick, onViewIssues: (r) => onIssuesClick(r.nameWithOwner) },
                  t,
                ),
              })
            }
          >
            <Avatar login={repo.owner.login} size={28} />
            <div className="repo-row-main">
              <div className="repo-row-title">
                <a
                  href={repo.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => event.stopPropagation()}
                >
                  <span className="owner">{repo.owner.login}</span>
                  <span className="slash">/</span>
                  {repo.name}
                </a>
              </div>
            </div>
            <div className="repo-row-stats">
              <span className="repo-row-flags">
                {repo.isFork ? (
                  <span
                    className="rb rb-icon fork tip"
                    data-tip={t("repo.fork")}
                    role="img"
                    aria-label={t("repo.fork")}
                  >
                    <LuGitFork size={11} />
                  </span>
                ) : null}
                {repo.isArchived ? (
                  <span
                    className="rb rb-icon archived tip"
                    data-tip={t("repo.archived")}
                    role="img"
                    aria-label={t("repo.archived")}
                  >
                    <LuArchive size={11} />
                  </span>
                ) : null}
                {repo.isPrivate ? (
                  <span
                    className="rb rb-icon private tip"
                    data-tip={t("repo.private")}
                    role="img"
                    aria-label={t("repo.private")}
                  >
                    <LuLock size={11} />
                  </span>
                ) : (
                  <span
                    className="rb rb-icon tip"
                    data-tip={t("repo.public")}
                    role="img"
                    aria-label={t("repo.public")}
                  >
                    <LuGlobe size={11} />
                  </span>
                )}
              </span>
              <button
                type="button"
                className={`rc-stat strong star tip ${repo.stargazerCount ? "clickable" : ""}`}
                data-tip={t("repo.stars")}
                onClick={(event) => {
                  event.stopPropagation();
                  if (repo.stargazerCount) onStarsClick(repo.nameWithOwner);
                }}
              >
                <StarIcon /> {formatNumber(repo.stargazerCount)}
              </button>
              <button
                type="button"
                className={`rc-stat strong fork tip ${repo.forkCount ? "clickable" : ""}`}
                data-tip={t("repo.forks")}
                onClick={(event) => {
                  event.stopPropagation();
                  if (repo.forkCount) onForksClick(repo.nameWithOwner);
                }}
              >
                <ForkIcon /> {formatNumber(repo.forkCount)}
              </button>
              <button
                type="button"
                className={`rc-stat iss tip ${issueCount ? "clickable" : ""}`}
                data-tip={t("repo.issues")}
                onClick={(event) => {
                  event.stopPropagation();
                  if (issueCount) onIssuesClick(repo.nameWithOwner);
                }}
              >
                <IssueIcon /> {issueCount}
              </button>
              <button
                type="button"
                className={`rc-stat local-clones tip ${cloneCount ? "clickable" : ""}`}
                data-tip={
                  cloneCount
                    ? `${t("repo.localClones", { count: cloneCount })}\n${clonePaths?.join("\n")}`
                    : t("repo.localClones", { count: 0 })
                }
                onClick={(event) => {
                  event.stopPropagation();
                  if (cloneCount) onLocalClick(repo.nameWithOwner);
                }}
              >
                <LuFolderGit2 /> {cloneCount}
              </button>
              <span className="repo-row-pushed repo-pushed tip" data-tip={t("tip.pushed")}>
                <LuClock size={12} aria-hidden />{" "}
                {repo.pushedAt ? formatRelativeTime(repo.pushedAt, Date.now(), language) : "-"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
