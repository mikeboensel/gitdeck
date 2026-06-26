import type { GhRepo } from "../../types/github";
import { formatNumber, formatRelativeTime } from "../../utils/format";
import type { InboxItem } from "../../utils/inbox";
import { Avatar } from "../common/Avatar";
import { BookIcon, CheckIcon } from "../common/Icons";

interface InboxPreviewProps {
  item: InboxItem | undefined;
  repo?: GhRepo;
  onRepoClick?: (repo: GhRepo) => void;
  onMarkRead?: (threadId: string) => void;
}

/** Right-hand reading pane: full detail for the selected inbox item. */
export function InboxPreview({ item, repo, onRepoClick, onMarkRead }: InboxPreviewProps) {
  if (!item) {
    return (
      <section className="inbox-reader empty-reader">
        <div>
          <strong>No item selected</strong>
          <span>Select an issue or pull request from the list.</span>
        </div>
      </section>
    );
  }

  const handleOpen = () => {
    if (item.unread && item.notificationThreadId && onMarkRead) {
      onMarkRead(item.notificationThreadId);
    }
  };

  return (
    <section className="inbox-reader">
      <header className="inbox-reader-head">
        <div className="inbox-reader-from">
          <Avatar login={item.author?.login} size={48} />
          <div className="inbox-reader-from-meta">
            <strong>{item.author?.login || "Unknown"}</strong>
            <span>
              {item.repository.nameWithOwner} · #{item.number} · {item.status}
            </span>
            <span className="inbox-reader-time">Updated {formatRelativeTime(item.updatedAt)}</span>
          </div>
          {item.unread ? <span className="inbox-unread-pill">Unread</span> : null}
        </div>
        <h2>{item.title}</h2>
        <div className="inbox-actions">
          <a
            className="btn primary"
            href={item.url}
            target="_blank"
            rel="noreferrer"
            onClick={handleOpen}
          >
            Open on GitHub
          </a>
          {item.unread && item.notificationThreadId && onMarkRead ? (
            <button
              className="btn"
              type="button"
              onClick={() => onMarkRead(item.notificationThreadId!)}
            >
              <CheckIcon /> Mark as read
            </button>
          ) : null}
          {repo && onRepoClick ? (
            <button className="btn" type="button" onClick={() => onRepoClick(repo)}>
              <BookIcon /> Repository
            </button>
          ) : null}
        </div>
      </header>

      <div className="inbox-reader-section">
        <h3>Why this needs attention</h3>
        <div className="inbox-reasons expanded">
          {item.reasons.map((itemReason) => (
            <span
              className={`inbox-reason tone-${itemReason.tone}`}
              key={`${item.id}-${itemReason.code}`}
            >
              {itemReason.label}
            </span>
          ))}
        </div>
      </div>

      <div className="inbox-reader-section">
        <h3>Context</h3>
        <div className="inbox-context-grid">
          <div>
            <span>Comments</span>
            <strong>{formatNumber(item.commentsCount)}</strong>
          </div>
          <div>
            <span>Attention score</span>
            <strong>{formatNumber(item.score)}</strong>
          </div>
          <div>
            <span>Created</span>
            <strong>{formatRelativeTime(item.createdAt)}</strong>
          </div>
          <div>
            <span>Updated</span>
            <strong>{formatRelativeTime(item.updatedAt)}</strong>
          </div>
        </div>
      </div>

      {item.branch || item.diff ? (
        <div className="inbox-reader-section">
          <h3>Pull request details</h3>
          <div className="inbox-pr-detail">
            {item.branch ? (
              <span>
                {item.branch.head} {"->"} {item.branch.base}
              </span>
            ) : null}
            {item.diff ? (
              <span>
                +{formatNumber(item.diff.additions)} -{formatNumber(item.diff.deletions)} across{" "}
                {formatNumber(item.diff.changedFiles)} files
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
