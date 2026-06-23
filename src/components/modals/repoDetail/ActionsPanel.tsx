import { useState } from "react";
import type { RepoDetailsData } from "../../../types/github";
import { formatNumber, formatRelativeTime } from "../../../utils/format";
import { clampPage } from "../../../utils/pagination";
import { Pagination } from "../../common/Pagination";
import { MODAL_PAGE_SIZE } from "./helpers";

interface ActionsPanelProps {
  details: RepoDetailsData | null;
  loading: boolean;
}

export function ActionsPanel({ details, loading }: ActionsPanelProps) {
  const [actionsPage, setActionsPage] = useState(1);
  const [actionsPageSize, setActionsPageSize] = useState(MODAL_PAGE_SIZE);

  const workflows = details?.workflows ?? [];
  const safeActionsPage = clampPage(actionsPage, workflows.length, actionsPageSize);
  const pagedWorkflows = workflows.slice(
    (safeActionsPage - 1) * actionsPageSize,
    safeActionsPage * actionsPageSize,
  );

  return (
    <section>
      <div className="modal-section-title section-title-with-count">
        <span>GitHub Actions history</span>
        <strong>{loading && !workflows.length ? "..." : formatNumber(workflows.length)}</strong>
      </div>
      {pagedWorkflows.map((run) => {
        const state = run.conclusion || run.status;
        const startedAt = run.run_started_at || run.created_at || run.updated_at;
        return (
          <a
            className="wf-row repo-actions-row"
            href={run.html_url}
            target="_blank"
            rel="noreferrer"
            key={run.id}
          >
            <span className={`wf-status ${state || "neutral"}`} aria-hidden="true" />
            <span className="wf-main">
              <span className="wf-title">
                {run.display_title || run.name || `Run #${run.run_number}`}
              </span>
              <span className="wf-meta">
                <span>{run.name || "Workflow"}</span>
                <span className="wf-branch">{run.head_branch || "default"}</span>
                <span>{run.event}</span>
                <span>#{run.run_number}</span>
              </span>
            </span>
            <span className="wf-time">
              {state || "unknown"} · {formatRelativeTime(startedAt)}
            </span>
          </a>
        );
      })}
      {loading && !workflows.length ? (
        <div className="modal-empty sub">Loading workflow runs...</div>
      ) : null}
      {!loading && !workflows.length ? (
        <div className="modal-empty sub">No workflow runs available.</div>
      ) : null}
      {workflows.length ? (
        <Pagination
          totalItems={workflows.length}
          page={safeActionsPage}
          pageSize={actionsPageSize}
          onPageChange={setActionsPage}
          onPageSizeChange={(size) => {
            setActionsPageSize(size);
            setActionsPage(1);
          }}
          showPageSize={false}
        />
      ) : null}
    </section>
  );
}
