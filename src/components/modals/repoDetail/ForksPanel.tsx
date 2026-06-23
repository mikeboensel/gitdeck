import { useEffect, useState } from "react";
import { fetchForks } from "../../../api/github";
import type { ForkNode, GhRepo } from "../../../types/github";
import { errorMessage } from "../../../utils/errors";
import { formatNumber, formatRelativeTime } from "../../../utils/format";
import { clampPage } from "../../../utils/pagination";
import { ForkIcon, StarIcon } from "../../common/Icons";
import { Pagination } from "../../common/Pagination";
import { MODAL_PAGE_SIZE } from "./helpers";

interface ForksPanelProps {
  repo: GhRepo;
}

export function ForksPanel({ repo }: ForksPanelProps) {
  const [forks, setForks] = useState<ForkNode[]>([]);
  const [forksTotal, setForksTotal] = useState(0);
  const [forksPage, setForksPage] = useState(1);
  const [forksPageSize, setForksPageSize] = useState(MODAL_PAGE_SIZE);
  const [forkField, setForkField] = useState("PUSHED_AT");
  const [forkDirection, setForkDirection] = useState<"DESC" | "ASC">("DESC");
  const [forksLoading, setForksLoading] = useState(false);
  const [forksError, setForksError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setForksLoading(true);
    setForksError("");
    void fetchForks({ repo: repo.nameWithOwner, field: forkField, direction: forkDirection })
      .then((result) => {
        if (cancelled) return;
        setForks(result.nodes);
        setForksTotal(result.totalCount);
        setForksPage(1);
      })
      .catch((err) => {
        if (!cancelled) setForksError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setForksLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [forkDirection, forkField, repo.nameWithOwner]);

  const safeForksPage = clampPage(forksPage, forks.length, forksPageSize);
  const pagedForks = forks.slice(
    (safeForksPage - 1) * forksPageSize,
    safeForksPage * forksPageSize,
  );

  return (
    <section>
      <div className="modal-section-title section-title-with-count">
        <span>Forks</span>
        <strong>
          {forksLoading && !forks.length ? "..." : formatNumber(forksTotal || forks.length)}
        </strong>
      </div>
      <div className="repo-detail-subtoolbar">
        <label>
          Sort
          <select value={forkField} onChange={(event) => setForkField(event.target.value)}>
            <option value="PUSHED_AT">Recently pushed</option>
            <option value="UPDATED_AT">Recently updated</option>
            <option value="CREATED_AT">Recently created</option>
            <option value="STARGAZERS">Most stars</option>
            <option value="NAME">Name</option>
          </select>
        </label>
        <label>
          Direction
          <select
            value={forkDirection}
            onChange={(event) => setForkDirection(event.target.value as "DESC" | "ASC")}
          >
            <option value="DESC">Descending</option>
            <option value="ASC">Ascending</option>
          </select>
        </label>
      </div>
      {forksError ? <div className="modal-error">{forksError}</div> : null}
      {pagedForks.map((fork) => (
        <a
          className="fork-row"
          href={fork.url}
          target="_blank"
          rel="noreferrer"
          key={fork.nameWithOwner}
        >
          <img src={fork.owner.avatarUrl} alt="" />
          <div>
            <div className="fr-title">{fork.nameWithOwner}</div>
            <div className="fr-desc">{fork.description || "No description"}</div>
          </div>
          <div className="fr-meta">
            <span className="mini-stat">
              <StarIcon /> {formatNumber(fork.stargazerCount)}
            </span>
            <span className="mini-stat">
              <ForkIcon /> {formatNumber(fork.forkCount)}
            </span>
            <span>pushed {formatRelativeTime(fork.pushedAt)}</span>
          </div>
        </a>
      ))}
      {forksLoading && !forks.length ? (
        <div className="modal-empty sub">Loading forks...</div>
      ) : null}
      {!forksLoading && !forks.length && !forksError ? (
        <div className="modal-empty sub">No forks available.</div>
      ) : null}
      {forks.length ? (
        <Pagination
          totalItems={forks.length}
          page={safeForksPage}
          pageSize={forksPageSize}
          onPageChange={setForksPage}
          onPageSizeChange={(size) => {
            setForksPageSize(size);
            setForksPage(1);
          }}
          showPageSize={false}
        />
      ) : null}
    </section>
  );
}
