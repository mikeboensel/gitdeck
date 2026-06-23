import { useState } from "react";
import type { GhPullRequest, GhRepo } from "../../../types/github";
import { formatNumber, formatRelativeTime } from "../../../utils/format";
import { clampPage } from "../../../utils/pagination";
import { Pagination } from "../../common/Pagination";
import { MODAL_PAGE_SIZE } from "./helpers";

interface PullRequestsPanelProps {
  repo: GhRepo;
  pullRequests: GhPullRequest[];
}

export function PullRequestsPanel({ repo, pullRequests }: PullRequestsPanelProps) {
  const [repoPrsPage, setRepoPrsPage] = useState(1);
  const [repoPrsPageSize, setRepoPrsPageSize] = useState(MODAL_PAGE_SIZE);

  const repoPullRequests = pullRequests.filter(
    (pr) => pr.repository.nameWithOwner === repo.nameWithOwner,
  );
  const safeRepoPrsPage = clampPage(repoPrsPage, repoPullRequests.length, repoPrsPageSize);
  const pagedRepoPrs = repoPullRequests.slice(
    (safeRepoPrsPage - 1) * repoPrsPageSize,
    safeRepoPrsPage * repoPrsPageSize,
  );

  return (
    <section>
      <div className="modal-section-title section-title-with-count">
        <span>Open pull requests</span>
        <strong>{formatNumber(repoPullRequests.length)}</strong>
      </div>
      {pagedRepoPrs.map((pr) => (
        <a
          className="repo-detail-issue"
          href={pr.url}
          target="_blank"
          rel="noreferrer"
          key={pr.url}
        >
          <span>#{pr.number}</span>
          <strong>{pr.title}</strong>
          <em>
            {pr.isDraft
              ? "Draft"
              : pr.reviewDecision?.replace("_", " ").toLowerCase() || "Review pending"}{" "}
            · {formatRelativeTime(pr.updatedAt)}
          </em>
        </a>
      ))}
      {!repoPullRequests.length ? (
        <div className="modal-empty sub">No open pull requests for this repository.</div>
      ) : null}
      {repoPullRequests.length ? (
        <Pagination
          totalItems={repoPullRequests.length}
          page={safeRepoPrsPage}
          pageSize={repoPrsPageSize}
          onPageChange={setRepoPrsPage}
          onPageSizeChange={(size) => {
            setRepoPrsPageSize(size);
            setRepoPrsPage(1);
          }}
          showPageSize={false}
        />
      ) : null}
    </section>
  );
}
