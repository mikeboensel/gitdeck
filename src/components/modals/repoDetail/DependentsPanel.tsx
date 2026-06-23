import { useState } from "react";
import type { DependentItem } from "../../../types/github";
import { formatNumber } from "../../../utils/format";
import { clampPage } from "../../../utils/pagination";
import { Pagination } from "../../common/Pagination";
import { MODAL_PAGE_SIZE } from "./helpers";

interface DependentsPanelProps {
  dependents: DependentItem[];
  loading: boolean;
}

export function DependentsPanel({ dependents, loading }: DependentsPanelProps) {
  const [dependentsPage, setDependentsPage] = useState(1);
  const [dependentsPageSize, setDependentsPageSize] = useState(MODAL_PAGE_SIZE);

  const safeDependentsPage = clampPage(dependentsPage, dependents.length, dependentsPageSize);
  const pagedDependents = dependents.slice(
    (safeDependentsPage - 1) * dependentsPageSize,
    safeDependentsPage * dependentsPageSize,
  );

  return (
    <section>
      <div className="modal-section-title section-title-with-count">
        <span>Dependent repositories</span>
        <strong>{loading && !dependents.length ? "..." : formatNumber(dependents.length)}</strong>
      </div>
      {pagedDependents.map((item) => (
        <a
          className="dependent-row"
          href={item.url}
          target="_blank"
          rel="noreferrer"
          key={item.nameWithOwner}
        >
          {item.avatar ? <img src={item.avatar} alt="" /> : <span />}
          <strong>{item.nameWithOwner}</strong>
          <em>
            ★ {formatNumber(item.stars)} · forks {formatNumber(item.forks)}
          </em>
        </a>
      ))}
      {!loading && !dependents.length ? (
        <div className="modal-empty sub">No dependents available.</div>
      ) : null}
      {dependents.length ? (
        <Pagination
          totalItems={dependents.length}
          page={safeDependentsPage}
          pageSize={dependentsPageSize}
          onPageChange={setDependentsPage}
          onPageSizeChange={(size) => {
            setDependentsPageSize(size);
            setDependentsPage(1);
          }}
          showPageSize={false}
        />
      ) : null}
    </section>
  );
}
