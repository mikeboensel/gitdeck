import type { ReactNode } from "react";
import { SiGithub } from "react-icons/si";

const REPO_URL = "https://github.com/DenseContext/gitdeck";

/** One piece of contextual info shown on the left of the status bar. */
export interface FooterSegment {
  key: string;
  icon?: ReactNode;
  label: string;
  /** Render emphasized (e.g. the current tab name). */
  strong?: boolean;
}

/** A value/label summary stat shown on the right of the status bar. */
export interface FooterStat {
  key: string;
  label: string;
  value: string;
  title?: string;
}

/**
 * Persistent status bar pinned to the bottom of the viewport. The left side
 * reflects the current tab and active filter selections; summary stats and the
 * GitHub link sit at the far right.
 */
export function Footer({
  segments,
  stats = [],
}: {
  segments: FooterSegment[];
  stats?: FooterStat[];
}) {
  return (
    <footer className="app-footer">
      <div className="app-footer-status">
        {segments.map((seg) => (
          <span
            className={`app-footer-seg${seg.strong ? " app-footer-seg--strong" : ""}`}
            key={seg.key}
          >
            {seg.icon ? <span className="app-footer-seg-icon">{seg.icon}</span> : null}
            <span className="app-footer-seg-label">{seg.label}</span>
          </span>
        ))}
      </div>
      {stats.length > 0 ? (
        <div className="app-footer-stats">
          {stats.map((stat) => (
            <span className="app-footer-stat" key={stat.key} title={stat.title}>
              <span className="app-footer-stat-value">{stat.value}</span>
              <span className="app-footer-stat-label">{stat.label}</span>
            </span>
          ))}
        </div>
      ) : null}
      <a
        className="app-footer-link tip"
        data-tip="GitHub"
        aria-label="GitHub"
        href={REPO_URL}
        target="_blank"
        rel="noreferrer"
      >
        <SiGithub size={16} />
      </a>
    </footer>
  );
}
