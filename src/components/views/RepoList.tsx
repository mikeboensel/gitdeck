import { getLanguageColor } from "../../utils/colors";
import { formatNumber, formatRelativeTime } from "../../utils/format";
import { issueCountForRepo } from "../../utils/dashboard";
import { Avatar } from "../common/Avatar";
import { ForkIcon, IssueIcon, StarIcon } from "../common/Icons";
import { useI18n } from "../../i18n/I18nProvider";
import type { RepoViewDataProps } from "./ReposView";

/**
 * Dense one-row-per-repo layout (core fields only). Reuses the shared
 * `.data-list` / `.rc-stat` / `.rb` visual language; density is applied by the
 * `.repos-view[data-density]` ancestor via CSS variables, so there are no
 * density conditionals here.
 */
export function RepoList({ repos, issues, onRepoClick, onIssuesClick, onStarsClick, onForksClick }: RepoViewDataProps) {
  const { language, t } = useI18n();
  if (!repos.length) {
    return <div className="empty"><div className="big">{t("empty.reposTitle")}</div><div>{t("empty.tryClearing")}</div></div>;
  }

  return (
    <div className="data-list repo-list">
      {repos.map((repo) => {
        const issueCount = issueCountForRepo(issues, repo.nameWithOwner);
        const primaryLanguage = repo.primaryLanguage?.name;
        return (
          <div
            className="data-row repo-row"
            key={repo.nameWithOwner}
            role="button"
            tabIndex={0}
            onClick={() => onRepoClick(repo)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onRepoClick(repo);
            }}
          >
            <Avatar login={repo.owner.login} size={28} />
            <div className="repo-row-main">
              <div className="repo-row-title">
                <a href={repo.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}><span className="owner">{repo.owner.login}</span><span className="slash">/</span>{repo.name}</a>
              </div>
              <div className="repo-badges">
                {repo.isPrivate ? <span className="rb private">{t("repo.private")}</span> : <span className="rb">{t("repo.public")}</span>}
                {repo.isArchived ? <span className="rb archived">{t("repo.archived")}</span> : null}
                {repo.isFork ? <span className="rb fork">{t("repo.fork")}</span> : null}
              </div>
            </div>
            <div className="repo-row-stats">
              <button className={`rc-stat strong star ${repo.stargazerCount ? "clickable" : ""}`} onClick={(event) => { event.stopPropagation(); if (repo.stargazerCount) onStarsClick(repo.nameWithOwner); }}><StarIcon /> {formatNumber(repo.stargazerCount)}</button>
              <button className={`rc-stat strong fork ${repo.forkCount ? "clickable" : ""}`} onClick={(event) => { event.stopPropagation(); if (repo.forkCount) onForksClick(repo.nameWithOwner); }}><ForkIcon /> {formatNumber(repo.forkCount)}</button>
              <button className={`rc-stat iss ${issueCount ? "clickable" : ""}`} onClick={(event) => { event.stopPropagation(); if (issueCount) onIssuesClick(repo.nameWithOwner); }}><IssueIcon /> {issueCount}</button>
              {primaryLanguage ? <span className="rc-lang"><span className="lang-dot" style={{ background: getLanguageColor(primaryLanguage) }} />{primaryLanguage}</span> : null}
              <span className="repo-row-pushed">{t("repo.pushed", { time: repo.pushedAt ? formatRelativeTime(repo.pushedAt, Date.now(), language) : "-" })}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
