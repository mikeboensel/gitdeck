import { type ComponentProps, useEffect, useState } from "react";
import type { GhRepo } from "../../types/github";
import { clampPage } from "../../utils/pagination";
import { Pagination } from "../common/Pagination";
import { ReposView } from "./ReposView";

type ReposPanelProps = Omit<ComponentProps<typeof ReposView>, "repos"> & {
  /** Full filtered repo list; paginated internally before reaching ReposView. */
  repos: GhRepo[];
  /** Changes whenever the repo filters change; resets pagination to page 1. */
  resetKey: unknown;
};

/**
 * The Repositories tab: the repo grid/list plus pagination. Owns its own page /
 * page-size state (used nowhere else); every other prop passes straight through
 * to {@link ReposView}. Snaps back to page 1 when the shared filters change.
 */
export function ReposPanel({ repos, resetKey, ...reposViewProps }: ReposPanelProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(
    () => Number(localStorage.getItem("gh-dash.reposPageSize")) || 20,
  );
  useEffect(() => {
    localStorage.setItem("gh-dash.reposPageSize", String(pageSize));
  }, [pageSize]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: resetKey is the intentional trigger — snap to page 1 whenever the parent's filters change
  useEffect(() => setPage(1), [resetKey]);

  const pageSafe = clampPage(page, repos.length, pageSize);
  const visible = repos.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  return (
    <div className="view-repos" style={{ display: "block" }}>
      <ReposView repos={visible} {...reposViewProps} />
      <Pagination
        totalItems={repos.length}
        page={pageSafe}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    </div>
  );
}
