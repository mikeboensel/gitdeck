import type { ReactNode } from "react";
import { getLabelCssVars } from "../../utils/colors";
import { formatNumber } from "../../utils/format";
import type { InboxItem } from "../../utils/inbox";
import { kindLabel, scoreTone } from "./inboxReaderHelpers";

function PropertyRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="inbox-property-row">
      <span>{label}</span>
      <strong>{children}</strong>
    </div>
  );
}

function LabelPills({ item }: { item: InboxItem }) {
  if (!item.labels.length) return <span className="inbox-muted">None</span>;
  return (
    <div className="inbox-labels">
      {item.labels.map((label) => {
        const vars = getLabelCssVars(label.color);
        return (
          <span
            className={vars ? "inbox-label gh-label" : "inbox-label"}
            key={label.name}
            style={vars}
          >
            {label.name}
          </span>
        );
      })}
    </div>
  );
}

/** Far-right metadata column: structured properties for the selected item. */
export function InboxProperties({ item }: { item: InboxItem | undefined }) {
  return (
    <aside className="inbox-properties">
      <div className="inbox-properties-head">
        <strong>Properties</strong>
      </div>
      {item ? (
        <>
          <PropertyRow label="Type">
            <span className={`inbox-kind ${item.kind}`}>{kindLabel(item)}</span>
          </PropertyRow>
          <PropertyRow label="Status">{item.status}</PropertyRow>
          <PropertyRow label="Score">
            <span className={`inbox-score tone-${scoreTone(item)}`}>
              {formatNumber(item.score)}
            </span>
          </PropertyRow>
          <PropertyRow label="Repository">{item.repository.nameWithOwner}</PropertyRow>
          <PropertyRow label="Author">{item.author?.login || "Unknown"}</PropertyRow>
          <PropertyRow label="Assignees">
            {item.assignees.length
              ? item.assignees.map((assignee) => assignee.login).join(", ")
              : "None"}
          </PropertyRow>
          <PropertyRow label="Created">{new Date(item.createdAt).toLocaleDateString()}</PropertyRow>
          <PropertyRow label="Updated">{new Date(item.updatedAt).toLocaleDateString()}</PropertyRow>
          {item.branch ? (
            <PropertyRow label="Branch">
              {item.branch.head} {"->"} {item.branch.base}
            </PropertyRow>
          ) : null}
          <div className="inbox-property-block">
            <span>Labels</span>
            <LabelPills item={item} />
          </div>
        </>
      ) : (
        <div className="inbox-properties-empty">Select an item to inspect its properties.</div>
      )}
    </aside>
  );
}
