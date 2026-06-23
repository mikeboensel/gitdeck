import { useMemo } from "react";
import { parseChangelog } from "../../utils/changelog";

// Optional import: the app must still build if CHANGELOG.md has been removed.
// import.meta.glob resolves to {} when no file matches, instead of erroring like
// a static `import ... from "...?raw"` would.
const changelogModules = import.meta.glob<string>("../../../CHANGELOG.md", {
  query: "?raw",
  import: "default",
  eager: true,
});
const changelogSource = Object.values(changelogModules)[0] ?? "";

import { APP_VERSION } from "../../version";
import { CloseIcon } from "../common/Icons";

interface ChangelogModalProps {
  onClose: () => void;
}

export function ChangelogModal({ onClose }: ChangelogModalProps) {
  const entries = useMemo(() => parseChangelog(changelogSource), []);

  return (
    <div className="modal-root">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-close; keyboard users close via the visible Close button */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click-to-close; keyboard users close via the visible Close button */}
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true">
        <header className="modal-head">
          <div className="modal-title">
            <span className="modal-icon repository">✦</span>
            <div style={{ minWidth: 0 }}>
              <div className="kind">Changelog</div>
              <h3>v{APP_VERSION}</h3>
            </div>
          </div>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>
        <div className="modal-body changelog-body">
          {entries.length === 0 ? (
            <div className="modal-empty">
              No release notes yet. Releases will appear here once published.
            </div>
          ) : null}
          {entries.map((entry) => (
            <article className="changelog-entry" key={entry.version}>
              <header className="changelog-version">
                <span className="changelog-version-tag">v{entry.version}</span>
                {entry.date ? <span className="changelog-version-date">{entry.date}</span> : null}
                {entry.url ? (
                  <a
                    className="changelog-version-link"
                    href={entry.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Compare →
                  </a>
                ) : null}
              </header>
              {entry.sections.map((section) => (
                <section className="changelog-section" key={section.title}>
                  <h4>{section.title}</h4>
                  <ul>
                    {section.items.map((item) => (
                      <li key={item.text}>
                        {item.scope ? (
                          <strong className="changelog-scope">{item.scope}:</strong>
                        ) : null}{" "}
                        {item.text}
                        {item.url ? (
                          <a
                            className="changelog-commit"
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {" "}
                            ↗
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
