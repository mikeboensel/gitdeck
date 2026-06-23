import { useState } from "react";
import type { GhRepo, RepoDetailsData } from "../../../types/github";
import { getLanguageColor } from "../../../utils/colors";
import { buildDailyRepoDigestMarkdown } from "../../../utils/digests";
import { formatNumber, formatRelativeTime } from "../../../utils/format";
import { clampPage } from "../../../utils/pagination";
import { Pagination } from "../../common/Pagination";
import { historyDelta, MODAL_PAGE_SIZE } from "./helpers";
import { MiniChart } from "./MiniChart";

interface OverviewPanelProps {
  repo: GhRepo;
  details: RepoDetailsData | null;
  loading: boolean;
}

export function OverviewPanel({ repo, details, loading }: OverviewPanelProps) {
  const [contributorsPage, setContributorsPage] = useState(1);

  const repoDigest = details?.digest ?? null;
  const contributors = details?.contributors || [];
  const security = details?.security ?? null;
  const languages = Object.entries(details?.languages || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const starsDelta = historyDelta(repo, "stars");
  const forksDelta = historyDelta(repo, "forks");
  const starHistory = (repo.history || []).map((entry) => entry.stars);
  const forkHistory = (repo.history || []).map((entry) => entry.forks);

  const safeContributorsPage = clampPage(contributorsPage, contributors.length, MODAL_PAGE_SIZE);
  const pagedContributors = contributors.slice(
    (safeContributorsPage - 1) * MODAL_PAGE_SIZE,
    safeContributorsPage * MODAL_PAGE_SIZE,
  );

  async function copyRepoDigest() {
    if (!repoDigest) return;
    await navigator.clipboard.writeText(buildDailyRepoDigestMarkdown(repoDigest));
  }

  return (
    <>
      {repoDigest ? (
        <section>
          <div className="modal-section-title section-title-with-count">
            <span>Daily repo digest</span>
            <strong>{repoDigest.date}</strong>
          </div>
          <div className="repo-detail-digest">
            <div className="repo-detail-digest-head">
              <div className="repo-detail-digest-badges">
                <span>
                  ★ {repoDigest.starsDelta >= 0 ? "+" : ""}
                  {formatNumber(repoDigest.starsDelta)}
                </span>
                <span>
                  forks {repoDigest.forksDelta >= 0 ? "+" : ""}
                  {formatNumber(repoDigest.forksDelta)}
                </span>
                <span>
                  issues {repoDigest.issueDelta >= 0 ? "+" : ""}
                  {formatNumber(repoDigest.issueDelta)}
                </span>
              </div>
              <button
                type="button"
                className="digest-copy-btn"
                onClick={() => void copyRepoDigest()}
              >
                Copy Markdown
              </button>
            </div>
            {repoDigest.ai ? (
              <div className="digest-ai-block">
                <div className="digest-ai-head">
                  <strong>{repoDigest.ai.headline}</strong>
                  <span>{repoDigest.ai.model}</span>
                </div>
                <div className="digest-ai-briefing">
                  {repoDigest.ai.briefing.map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="digest-pill-groups">
              <div className="digest-pill-group">
                <h4>Executive Summary</h4>
                {repoDigest.executiveSummary.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
              {repoDigest.momentum.length ? (
                <div className="digest-pill-group positive">
                  <h4>Momentum</h4>
                  {repoDigest.momentum.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              ) : null}
              {repoDigest.risks.length ? (
                <div className="digest-pill-group risk">
                  <h4>Risks</h4>
                  {repoDigest.risks.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      <section>
        <div className="modal-section-title section-title-with-count">
          <span>Contributors</span>
          <strong>
            {loading && !contributors.length ? "..." : formatNumber(contributors.length)}
          </strong>
        </div>
        {loading && !contributors.length ? (
          <div className="modal-empty sub">Loading contributors...</div>
        ) : null}
        {contributors.length ? (
          <div className="repo-detail-contributors">
            {pagedContributors.map((person) => {
              const name = person.login || person.name || person.email || "Anonymous";
              return (
                <a
                  href={person.html_url || person.url}
                  target="_blank"
                  rel="noreferrer"
                  key={person.login || person.html_url || person.url || person.email || name}
                >
                  {person.avatar_url || person.avatarUrl ? (
                    <img src={person.avatar_url || person.avatarUrl} alt="" />
                  ) : (
                    <span className="repo-detail-avatar-fallback">
                      {name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span>{name}</span>
                  <em>{formatNumber(person.contributions)}</em>
                </a>
              );
            })}
          </div>
        ) : !loading ? (
          <div className="modal-empty sub">No contributors available.</div>
        ) : null}
        {contributors.length ? (
          <Pagination
            totalItems={contributors.length}
            page={safeContributorsPage}
            pageSize={MODAL_PAGE_SIZE}
            onPageChange={setContributorsPage}
            onPageSizeChange={() => {}}
            showPageSize={false}
          />
        ) : null}
      </section>

      <section>
        <div className="modal-section-title section-title-with-count">
          <span>Security and quality</span>
          <strong>{security ? formatNumber(security.totalOpen) : "..."}</strong>
        </div>
        <div className="repo-detail-traffic-grid">
          <div className="repo-detail-traffic-card">
            <span className="repo-detail-traffic-label">Dependabot alerts</span>
            <strong>{security ? formatNumber(security.dependabotOpen) : "..."}</strong>
            <em>
              {security
                ? security.dependabotOpen
                  ? "Open dependency advisories."
                  : "No open dependency alerts."
                : "Loading security data..."}
            </em>
          </div>
          <div className="repo-detail-traffic-card">
            <span className="repo-detail-traffic-label">Code scanning alerts</span>
            <strong>{security ? formatNumber(security.codeScanningOpen) : "..."}</strong>
            <em>
              {security
                ? security.codeScanningOpen
                  ? "Open code scanning findings."
                  : "No open code scanning alerts."
                : "Loading security data..."}
            </em>
          </div>
        </div>
        {security?.latestUpdatedAt ? (
          <div className="modal-info-banner">
            Last security update {formatRelativeTime(security.latestUpdatedAt)}
          </div>
        ) : null}
        {security?.unavailable ? (
          <div className="modal-info-banner">
            Security alerts are not fully available with the current permissions or repository
            settings.
          </div>
        ) : null}
      </section>

      {languages.length ? (
        <section>
          <div className="modal-section-title">Languages</div>
          <div className="repo-detail-languages">
            {languages.map(([name, bytes]) => (
              <span key={name}>
                <i style={{ background: getLanguageColor(name) }} />
                {name}
                <em>{formatNumber(bytes)}</em>
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <div className="modal-section-title">Repository trend</div>
        <div className="repo-chart-grid">
          <MiniChart title="Stars" values={starHistory} tone="amber" />
          <MiniChart title="Forks" values={forkHistory} tone="purple" />
        </div>
      </section>

      <section className="repo-detail-history">
        <div className="modal-section-title">Recent trend</div>
        <div className="repo-detail-trend">
          <span>
            Stars{" "}
            {starsDelta === null
              ? "not enough history"
              : `${starsDelta >= 0 ? "+" : ""}${formatNumber(starsDelta)}`}
          </span>
          <span>
            Forks{" "}
            {forksDelta === null
              ? "not enough history"
              : `${forksDelta >= 0 ? "+" : ""}${formatNumber(forksDelta)}`}
          </span>
        </div>
      </section>
    </>
  );
}
