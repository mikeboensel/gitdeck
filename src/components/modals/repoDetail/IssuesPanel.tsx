import { useState } from "react";
import type { GhIssue, GhRepo } from "../../../types/github";
import { formatNumber, formatRelativeTime } from "../../../utils/format";
import { clampPage } from "../../../utils/pagination";
import { Pagination } from "../../common/Pagination";
import { MODAL_PAGE_SIZE } from "./helpers";

interface IssuesPanelProps {
  repo: GhRepo;
  issues: GhIssue[];
}

export function IssuesPanel({ repo, issues }: IssuesPanelProps) {
  const [repoIssuesPage, setRepoIssuesPage] = useState(1);
  const [repoIssuesPageSize, setRepoIssuesPageSize] = useState(MODAL_PAGE_SIZE);

  const repoIssues = issues.filter((issue) => issue.repository.nameWithOwner === repo.nameWithOwner);
  const safeRepoIssuesPage = clampPage(repoIssuesPage, repoIssues.length, repoIssuesPageSize);
  const pagedRepoIssues = repoIssues.slice((safeRepoIssuesPage - 1) * repoIssuesPageSize, safeRepoIssuesPage * repoIssuesPageSize);

  return (
    <section>
      <div className="modal-section-title section-title-with-count">
        <span>Open issues in dashboard</span>
        <strong>{formatNumber(repoIssues.length)}</strong>
      </div>
      {repoIssues.length ? pagedRepoIssues.map((issue) => (
        <a className="repo-detail-issue" href={issue.url} target="_blank" rel="noreferrer" key={issue.url}>
          <span>#{issue.number}</span>
          <strong>{issue.title}</strong>
          <em>{formatRelativeTime(issue.updatedAt)}</em>
        </a>
      )) : <div className="modal-empty sub">No open issues for this repository.</div>}
      {repoIssues.length ? (
        <Pagination
          totalItems={repoIssues.length}
          page={safeRepoIssuesPage}
          pageSize={repoIssuesPageSize}
          onPageChange={setRepoIssuesPage}
          onPageSizeChange={(size) => {
            setRepoIssuesPageSize(size);
            setRepoIssuesPage(1);
          }}
          showPageSize={false}
        />
      ) : null}
    </section>
  );
}
