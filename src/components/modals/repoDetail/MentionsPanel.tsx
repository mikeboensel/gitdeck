import { useState } from "react";
import type { MentionCodeItem, MentionIssueItem } from "../../../types/github";
import { formatNumber, formatRelativeTime } from "../../../utils/format";
import { clampPage } from "../../../utils/pagination";
import { Pagination } from "../../common/Pagination";
import { MODAL_PAGE_SIZE } from "./helpers";

interface MentionsPanelProps {
  mentionIssues: MentionIssueItem[];
  mentionCode: MentionCodeItem[];
  aliases: string[];
  aliasInput: string;
  aliasError: string;
  aliasBusy: boolean;
  loading: boolean;
  onAliasInputChange: (value: string) => void;
  onSubmitAlias: () => void;
  onDeleteAlias: (alias: string) => void;
}

export function MentionsPanel({
  mentionIssues,
  mentionCode,
  aliases,
  aliasInput,
  aliasError,
  aliasBusy,
  loading,
  onAliasInputChange,
  onSubmitAlias,
  onDeleteAlias,
}: MentionsPanelProps) {
  const [mentionsPage, setMentionsPage] = useState(1);
  const [mentionsPageSize, setMentionsPageSize] = useState(MODAL_PAGE_SIZE);

  const mentionItems = [
    ...mentionIssues.map((item) => ({ kind: "issue" as const, key: item.url, item })),
    ...mentionCode.map((item) => ({ kind: "code" as const, key: item.url, item })),
  ];
  const safeMentionsPage = clampPage(mentionsPage, mentionItems.length, mentionsPageSize);
  const pagedMentionItems = mentionItems.slice(
    (safeMentionsPage - 1) * mentionsPageSize,
    safeMentionsPage * mentionsPageSize,
  );

  return (
    <>
      <section>
        <div className="modal-section-title section-title-with-count">
          <span>Previous names</span>
          <strong>{formatNumber(aliases.length)}</strong>
        </div>
        <p className="modal-empty sub" style={{ marginTop: 0 }}>
          Add owner/repo names this project used to be known by; mentions will include matches
          against them.
        </p>
        {aliases.length ? (
          <div className="repo-alias-list">
            {aliases.map((alias) => (
              <span className="repo-alias-chip" key={alias}>
                <code>{alias}</code>
                <button
                  type="button"
                  aria-label={`Remove alias ${alias}`}
                  disabled={aliasBusy}
                  onClick={() => onDeleteAlias(alias)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <form
          className="repo-alias-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmitAlias();
          }}
        >
          <input
            type="text"
            placeholder="owner/old-name"
            value={aliasInput}
            onChange={(event) => onAliasInputChange(event.target.value)}
            disabled={aliasBusy}
            spellCheck={false}
          />
          <button type="submit" disabled={aliasBusy || !aliasInput.trim()}>
            Add
          </button>
        </form>
        {aliasError ? (
          <div className="modal-error" style={{ marginTop: 8 }}>
            {aliasError}
          </div>
        ) : null}
      </section>

      <section>
        <div className="modal-section-title section-title-with-count">
          <span>Mentions from other repositories</span>
          <strong>
            {loading && !mentionItems.length ? "..." : formatNumber(mentionItems.length)}
          </strong>
        </div>
        {pagedMentionItems.map((entry) =>
          entry.kind === "issue" ? (
            <a
              className="mention-row compact"
              href={entry.item.url}
              target="_blank"
              rel="noreferrer"
              key={entry.key}
            >
              <span className={`mr-icon ${entry.item.isPullRequest ? "pr-open" : "issue-open"}`}>
                {entry.item.isPullRequest ? "PR" : "I"}
              </span>
              <span className="mr-main">
                <strong>{entry.item.title}</strong>
                <em>
                  {entry.item.repository.nameWithOwner} #{entry.item.number} ·{" "}
                  {formatRelativeTime(entry.item.updatedAt)}
                </em>
              </span>
            </a>
          ) : (
            <a
              className="mention-row compact"
              href={entry.item.url}
              target="_blank"
              rel="noreferrer"
              key={entry.key}
            >
              <span className="mr-icon code">C</span>
              <span className="mr-main">
                <strong>{entry.item.path}</strong>
                <em>{entry.item.repository.nameWithOwner}</em>
              </span>
            </a>
          ),
        )}
        {!loading && !mentionItems.length ? (
          <div className="modal-empty sub">No external mentions found.</div>
        ) : null}
        {mentionItems.length ? (
          <Pagination
            totalItems={mentionItems.length}
            page={safeMentionsPage}
            pageSize={mentionsPageSize}
            onPageChange={setMentionsPage}
            onPageSizeChange={(size) => {
              setMentionsPageSize(size);
              setMentionsPage(1);
            }}
            showPageSize={false}
          />
        ) : null}
      </section>
    </>
  );
}
