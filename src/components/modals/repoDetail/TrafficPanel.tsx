import type { RepoDetailsData, RepoTrafficDetails } from "../../../types/github";
import { formatNumber } from "../../../utils/format";
import { MiniChart } from "./MiniChart";

interface TrafficPanelProps {
  details: RepoDetailsData | null;
  trafficDetails: RepoTrafficDetails | null;
}

export function TrafficPanel({ details, trafficDetails }: TrafficPanelProps) {
  const views = details?.views ?? null;
  const clones = trafficDetails?.clones ?? null;
  const referrers = trafficDetails?.referrers ?? [];
  const popularPaths = trafficDetails?.paths ?? [];
  const trafficForbidden = trafficDetails?.forbidden ?? false;
  const viewHistory = (views?.views || []).map((entry) => entry.count);
  const cloneHistory = (clones?.clones || []).map((entry) => entry.count);

  return (
    <section>
      <div className="modal-section-title">Traffic</div>
      <div className="repo-detail-traffic-grid">
        <div className="repo-detail-traffic-card">
          <span className="repo-detail-traffic-label">Views (last 14 days)</span>
          <strong>{views ? formatNumber(views.count) : "n/a"}</strong>
          <em>
            {views
              ? `${formatNumber(views.uniques)} unique visitors`
              : "Traffic data may require admin access."}
          </em>
        </div>
        <div className="repo-detail-traffic-card">
          <span className="repo-detail-traffic-label">Clones (last 14 days)</span>
          <strong>{clones ? formatNumber(clones.count) : "n/a"}</strong>
          <em>
            {clones
              ? `${formatNumber(clones.uniques)} unique cloners`
              : "Clone data may require admin access."}
          </em>
        </div>
      </div>
      <div className="repo-chart-grid">
        <MiniChart title="Views" values={viewHistory} />
        <MiniChart title="Clones" values={cloneHistory} tone="green" />
      </div>
      {trafficForbidden ? (
        <div className="modal-info-banner">
          Traffic breakdown is not available for this repository with the current GitHub
          permissions.
        </div>
      ) : null}
      {referrers.length ? (
        <>
          <div className="modal-section-title">Top referrers</div>
          <div className="repo-detail-traffic-list">
            {referrers.map((referrer) => (
              <div className="repo-detail-traffic-row" key={referrer.referrer}>
                <strong>{referrer.referrer}</strong>
                <span>{formatNumber(referrer.count)} views</span>
                <em>{formatNumber(referrer.uniques)} unique</em>
              </div>
            ))}
          </div>
        </>
      ) : null}
      {popularPaths.length ? (
        <>
          <div className="modal-section-title">Popular pages</div>
          <div className="repo-detail-traffic-list">
            {popularPaths.map((path) => (
              <div className="repo-detail-traffic-row" key={path.path}>
                <strong title={path.path}>{path.title || path.path}</strong>
                <span>{formatNumber(path.count)} views</span>
                <em>{formatNumber(path.uniques)} unique</em>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
