import { useMemo } from "react";
import type { WidgetContext } from "../types";
import { buildHealthMatrix, DIMENSIONS } from "./matrix";

/**
 * Repositories × health dimensions as a colored grid. Each cell is one component
 * of the health score (activity, issues, security, traffic, momentum), so a fully
 * red column instantly reveals a systemic gap a single score would hide.
 */
export function HealthMatrix({ ctx }: { ctx: WidgetContext }) {
  const rows = useMemo(
    () => buildHealthMatrix(ctx.insights, ctx.reposByName),
    [ctx.insights, ctx.reposByName],
  );

  if (!rows.length) {
    return <div className="lab-empty">No repository insights loaded yet.</div>;
  }

  return (
    <div className="health-matrix">
      <div className="health-matrix-grid">
        <div className="health-matrix-row health-matrix-headrow">
          <span className="health-matrix-repo">Repository</span>
          {DIMENSIONS.map((dim) => (
            <span key={dim.key} className="health-matrix-col" data-tip={dim.label}>
              {dim.short}
            </span>
          ))}
        </div>
        {rows.map((row) => {
          const repo = ctx.reposByName.get(row.repo);
          return (
            <article
              key={row.repo}
              className={`health-matrix-row${row.archived ? " is-archived" : ""}`}
              // biome-ignore lint/a11y/noNoninteractiveTabindex: intentionally keyboard-focusable row that opens the repo modal; holds the repo name plus cell flow content, so it cannot be a native <button>
              tabIndex={0}
              onClick={() => repo && ctx.onRepoClick(repo)}
              onKeyDown={(event) => event.key === "Enter" && repo && ctx.onRepoClick(repo)}
            >
              <span className="health-matrix-repo" title={row.repo}>
                {row.repo}
              </span>
              {row.cells.map((cell) => (
                <span
                  key={cell.dimension.key}
                  className={`health-matrix-cell state-${cell.state}`}
                  data-tip={`${cell.dimension.label}: ${cell.detail}`}
                />
              ))}
            </article>
          );
        })}
      </div>
    </div>
  );
}
