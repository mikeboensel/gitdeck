import { useState } from "react";
import type { RepoDetailsData } from "../../../types/github";
import { formatBytes, formatNumber } from "../../../utils/format";
import { clampPage } from "../../../utils/pagination";
import { Pagination } from "../../common/Pagination";
import { formatReleaseDate } from "./helpers";

interface ReleasesPanelProps {
  details: RepoDetailsData | null;
  loading: boolean;
}

export function ReleasesPanel({ details, loading }: ReleasesPanelProps) {
  const [releasesPage, setReleasesPage] = useState(1);
  const [openReleaseIds, setOpenReleaseIds] = useState<number[]>([]);

  const releases = details?.releases ?? [];
  const totalReleaseDownloads = releases.reduce((sum, release) => sum + release.totalDownloads, 0);
  const releasesPageSize = 10;
  const safeReleasesPage = clampPage(releasesPage, releases.length, releasesPageSize);
  const pagedReleases = releases.slice(
    (safeReleasesPage - 1) * releasesPageSize,
    safeReleasesPage * releasesPageSize,
  );

  function toggleRelease(releaseId: number) {
    setOpenReleaseIds((current) =>
      current.includes(releaseId)
        ? current.filter((id) => id !== releaseId)
        : [...current, releaseId],
    );
  }

  return (
    <section>
      <div className="modal-section-title section-title-with-count">
        <span>Releases</span>
        <strong>{formatNumber(releases.length)}</strong>
      </div>
      <div className="repo-detail-traffic-grid">
        <div className="repo-detail-traffic-card">
          <span className="repo-detail-traffic-label">Release downloads</span>
          <strong>{formatNumber(totalReleaseDownloads)}</strong>
          <em>
            {releases.length
              ? `${formatNumber(releases.length)} total releases`
              : "No releases found."}
          </em>
        </div>
        <div className="repo-detail-traffic-card">
          <span className="repo-detail-traffic-label">Latest release</span>
          <strong>{releases[0]?.tag_name || "n/a"}</strong>
          <em>
            {releases[0] ? formatReleaseDate(releases[0].published_at) : "No release published."}
          </em>
        </div>
      </div>
      {releases.length ? (
        <div className="repo-detail-releases">
          {pagedReleases.map((release) => (
            <div className="repo-detail-release" key={release.id}>
              <button
                className={`repo-detail-release-head ${openReleaseIds.includes(release.id) ? "open" : ""}`}
                type="button"
                onClick={() => toggleRelease(release.id)}
                aria-expanded={openReleaseIds.includes(release.id)}
              >
                <div>
                  <strong>{release.name || release.tag_name}</strong>
                  <span>
                    {release.tag_name} · {formatReleaseDate(release.published_at)}
                  </span>
                </div>
                <span>{formatNumber(release.totalDownloads)} downloads</span>
              </button>
              {openReleaseIds.includes(release.id) ? (
                release.assets.length ? (
                  <div className="repo-detail-release-assets">
                    <a
                      className="repo-detail-release-link"
                      href={release.html_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span>Open release on GitHub</span>
                      <em>{release.tag_name}</em>
                    </a>
                    {release.assets.map((asset) => (
                      <a
                        href={asset.browser_download_url || release.html_url}
                        target="_blank"
                        rel="noreferrer"
                        key={asset.id}
                      >
                        <span>{asset.name}</span>
                        <em>
                          {formatNumber(asset.download_count)} downloads ·{" "}
                          {formatBytes(asset.size || 0)}
                        </em>
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="repo-detail-release-assets">
                    <a
                      className="repo-detail-release-link"
                      href={release.html_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span>Open release on GitHub</span>
                      <em>{release.tag_name}</em>
                    </a>
                    <div className="modal-empty sub">No assets attached to this release.</div>
                  </div>
                )
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {!loading && !releases.length ? (
        <div className="modal-empty sub">No releases available.</div>
      ) : null}
      {releases.length ? (
        <Pagination
          totalItems={releases.length}
          page={safeReleasesPage}
          pageSize={releasesPageSize}
          onPageChange={setReleasesPage}
          onPageSizeChange={() => {}}
          showPageSize={false}
        />
      ) : null}
    </section>
  );
}
