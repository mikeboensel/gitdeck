import { lazy, Suspense, useEffect, useState } from "react";
import { fetchLocalStash, fetchLocalStashes } from "../api/github";
import type { DiffMode } from "../components/common/DiffPanel";
import { useI18n } from "../i18n/I18nProvider";
import type { LocalRepo, LocalStashDetail, LocalStashEntry } from "../types/github";
import { errorMessage } from "../utils/errors";
import { formatRelativeTime } from "../utils/format";
import { CloseIcon } from "./common/Icons";

// Code-split so the diff renderer + its highlighter (lowlight) load only when a
// stash is actually opened, keeping them out of the main bundle.
const DiffPanel = lazy(() => import("./common/DiffPanel"));

interface StashViewerModalProps {
  repo: LocalRepo;
  onClose: () => void;
}

/**
 * Right pane: the selected stash's full diff, rendered per-file with syntax
 * highlighting and a split/unified toggle. Owns its own detail fetch keyed by the
 * stash index, so the modal stays focused on the list + selection.
 */
function StashDetailPanel({
  repoPath,
  stash,
  mode,
  onModeChange,
}: {
  repoPath: string;
  stash: LocalStashEntry;
  mode: DiffMode;
  onModeChange: (mode: DiffMode) => void;
}) {
  const { language, t } = useI18n();
  const [detail, setDetail] = useState<LocalStashDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetchLocalStash(repoPath, stash.index, controller.signal)
      .then((data) => !controller.signal.aborted && setDetail(data))
      .catch((err: unknown) => !controller.signal.aborted && setError(errorMessage(err)))
      .finally(() => !controller.signal.aborted && setLoading(false));
    return () => controller.abort();
  }, [repoPath, stash.index]);

  return (
    <>
      <div className="stash-diff-head">
        <div className="stash-diff-meta">
          <code className="history-sha">{stash.ref}</code>
          {stash.branch ? (
            <span className="stash-entry-branch">
              {t("stash.onBranch", { branch: stash.branch })}
            </span>
          ) : null}
          <span className="history-date">
            {formatRelativeTime(stash.date, Date.now(), language)}
          </span>
          {detail ? (
            <span className="stash-diff-count">
              {t("history.changedFiles", { count: detail.files.length })}
            </span>
          ) : null}
        </div>
        <div className="stash-mode">
          <button
            type="button"
            className={`stash-mode-btn${mode === "unified" ? " active" : ""}`}
            onClick={() => onModeChange("unified")}
          >
            {t("stash.unified")}
          </button>
          <button
            type="button"
            className={`stash-mode-btn${mode === "split" ? " active" : ""}`}
            onClick={() => onModeChange("split")}
          >
            {t("stash.split")}
          </button>
        </div>
      </div>

      <div className="stash-diff-scroll">
        {loading ? (
          <div className="history-status">{t("common.loading")}</div>
        ) : error ? (
          <div className="history-status error">{error}</div>
        ) : detail ? (
          <Suspense fallback={<div className="history-status">{t("common.loading")}</div>}>
            <DiffPanel patch={detail.patch} mode={mode} />
          </Suspense>
        ) : null}
      </div>
    </>
  );
}

/**
 * Full-screen stash viewer for one local repo. Left pane lists the stash stack
 * (`refs/stash`, shared across the repo's worktrees); the right pane shows the
 * selected stash's full diff. Read-only — mirrors {@link CommitHistoryModal}.
 */
export function StashViewerModal({ repo, onClose }: StashViewerModalProps) {
  const { language, t } = useI18n();
  const [stashes, setStashes] = useState<LocalStashEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [mode, setMode] = useState<DiffMode>("unified");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    fetchLocalStashes(repo.path, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setStashes(data.stashes);
        setSelectedIndex((current) => current ?? data.stashes[0]?.index ?? null);
      })
      .catch((err: unknown) => !controller.signal.aborted && setLoadError(errorMessage(err)))
      .finally(() => !controller.signal.aborted && setLoading(false));
    return () => controller.abort();
  }, [repo.path]);

  // Esc closes the modal.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const selected = stashes?.find((s) => s.index === selectedIndex) ?? null;

  return (
    <div className="modal-root">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-close; keyboard users close via the visible Close button / Esc */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click-to-close; keyboard users close via the visible Close button / Esc */}
      <div className="modal-backdrop" onClick={onClose} />
      <div
        className="modal history-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t("stash.title")}
      >
        <header className="modal-head">
          <div className="modal-title">
            <span className="modal-icon repository">⎘</span>
            <div style={{ minWidth: 0 }}>
              <div className="kind">{t("stash.title")}</div>
              <h3>{repo.name}</h3>
            </div>
          </div>
          <button
            type="button"
            className="modal-close"
            aria-label={t("common.close")}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </header>

        <div className="history-body">
          <div className="stash-list-pane">
            {loading ? (
              <div className="history-status">{t("common.loading")}</div>
            ) : loadError ? (
              <div className="history-status error">{loadError}</div>
            ) : !stashes || stashes.length === 0 ? (
              <div className="history-status">{t("stash.empty")}</div>
            ) : (
              <ul className="stash-list">
                {stashes.map((stash) => (
                  <li key={stash.ref}>
                    <button
                      type="button"
                      className={`stash-entry${stash.index === selectedIndex ? " selected" : ""}`}
                      onClick={() => setSelectedIndex(stash.index)}
                    >
                      <div className="stash-entry-top">
                        <code className="stash-entry-ref">{stash.ref}</code>
                        {stash.branch ? (
                          <span className="stash-entry-branch">{stash.branch}</span>
                        ) : null}
                        <span className="stash-entry-date">
                          {formatRelativeTime(stash.date, Date.now(), language)}
                        </span>
                      </div>
                      <div className="stash-entry-msg" title={stash.message || stash.subject}>
                        {stash.message || stash.subject}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <aside className="stash-diff-pane">
            {selected ? (
              <StashDetailPanel
                repoPath={repo.path}
                stash={selected}
                mode={mode}
                onModeChange={setMode}
              />
            ) : (
              <div className="history-status">{t("stash.selectPrompt")}</div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
