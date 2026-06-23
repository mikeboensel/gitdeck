import { LuClock, LuFolderGit2, LuGitFork, LuGlobe, LuLock, LuTriangleAlert } from "react-icons/lu";
import { useCloneRepo } from "../../contexts/CloneRepoProvider";
import { useRightClickMenu } from "../../contexts/RightClickMenuProvider";
import { useI18n } from "../../i18n/I18nProvider";
import { buildRepoMenu } from "../../menus/repoMenu";
import { issueCountForRepo } from "../../utils/dashboard";
import { formatNumber, formatRelativeTime } from "../../utils/format";
import { Avatar } from "../common/Avatar";
import { ForkIcon, IssueIcon, StarIcon } from "../common/Icons";
import { LanguageIcon } from "../common/LanguageIcon";
import type { RepoViewDataProps } from "./ReposView";

export function RepoGrid({
  repos,
  issues,
  insightsByRepo,
  localClonesByRepo,
  onRepoClick,
  onIssuesClick,
  onStarsClick,
  onForksClick,
  onLocalClick,
}: RepoViewDataProps) {
  const { language, t } = useI18n();
  const { open } = useRightClickMenu();
  const { openClone } = useCloneRepo();
  if (!repos.length) {
    return (
      <div className="empty">
        <div className="big">{t("empty.reposTitle")}</div>
        <div>{t("empty.tryClearing")}</div>
      </div>
    );
  }

  return (
    <div className="repos-grid">
      {repos.map((repo) => {
        const issueCount = issueCountForRepo(issues, repo.nameWithOwner);
        const primaryLanguage = repo.primaryLanguage?.name;
        const insight = insightsByRepo.get(repo.nameWithOwner);
        const clonePaths = localClonesByRepo.get(repo.nameWithOwner.toLowerCase());
        const cloneCount = clonePaths?.length ?? 0;
        // Security row carries signal only when there are real open alerts (>0,
        // styled as an alert) or the fetch failed (error icon + the real reason on
        // hover). A confirmed clean 0 shows nothing.
        const securityError = insight?.errors?.security;
        const securityCount = insight?.securityAlertsCount ?? 0;
        const securityNote = securityError ? (
          <span
            className="repo-security-note metric-error tip"
            data-tip={securityError}
            role="img"
            aria-label={securityError}
          >
            <LuTriangleAlert size={11} /> {t("insights.securityAlerts", { count: "" }).trim()}
          </span>
        ) : securityCount > 0 ? (
          <span className="repo-security-note alert tip" data-tip={t("tip.securityAlerts")}>
            {t("insights.securityAlerts", { count: formatNumber(securityCount) })}
          </span>
        ) : null;
        return (
          <article
            className="repo-card"
            key={repo.nameWithOwner}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: intentionally keyboard-focusable card (see .repo-card:focus-visible); cannot be a <button> because it contains nested interactive elements (repo link + stat buttons)
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
                  {
                    onOpen: onRepoClick,
                    onViewIssues: (r) => onIssuesClick(r.nameWithOwner),
                    onClone: openClone,
                  },
                  t,
                ),
              })
            }
          >
            <div className="rc-head">
              <Avatar login={repo.owner.login} size={28} />
              <div className="rc-title">
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
              <div className="repo-badges">
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
                {repo.isArchived ? <span className="rb archived">{t("repo.archived")}</span> : null}
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
              </div>
            </div>
            <div className="repo-desc">{repo.description || t("repo.noDescription")}</div>
            {securityNote ? <div className="repo-security-row">{securityNote}</div> : null}
            <div className="rc-stats">
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
              {primaryLanguage ? (
                <span
                  className="rc-lang tip"
                  role="img"
                  aria-label={primaryLanguage}
                  data-tip={primaryLanguage}
                >
                  <LanguageIcon name={primaryLanguage} />
                </span>
              ) : null}
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
              <span className="repo-pushed tip" data-tip={t("tip.pushed")}>
                <LuClock size={12} aria-hidden />{" "}
                {repo.pushedAt ? formatRelativeTime(repo.pushedAt, Date.now(), language) : "-"}
              </span>
            </div>
          </article>
        );
      })}
    </div>
  );
}
