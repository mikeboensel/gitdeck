import { useEffect, useState } from "react";
import { fetchLocalStash, fetchLocalStashes } from "../../api/github";
import { useI18n } from "../../i18n/I18nProvider";
import type { LocalRepo, LocalStashDetail, LocalStashEntry } from "../../types/github";
import { errorMessage } from "../../utils/errors";
import { formatRelativeTime } from "../../utils/format";
import { Modal } from "../common/Modal";
import { DiffViewerPane } from "./DiffViewerPane";

interface StashViewerModalProps {
  repo: LocalRepo;
  onClose: () => void;
}

/**
 * Right pane: the selected stash's full diff via {@link DiffViewerPane}. Owns its
 * own detail fetch keyed by the stash index, so the modal stays focused on the
 * list + selection; the diff chrome (toggle/scroll/states) lives in the pane.
 */
function StashDetailPanel({ repoPath, stash }: { repoPath: string; stash: LocalStashEntry }) {
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
    <DiffViewerPane
      patch={detail?.patch ?? null}
      loading={loading}
      error={error}
      meta={
        <>
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
            <span className="diff-pane-count">
              {t("history.changedFiles", { count: detail.files.length })}
            </span>
          ) : null}
        </>
      }
    />
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

  const selected = stashes?.find((s) => s.index === selectedIndex) ?? null;

  return (
    <Modal
      className="history-modal"
      ariaLabel={t("stash.title")}
      onClose={onClose}
      title={
        <>
          <span className="modal-icon repository">⎘</span>
          <div style={{ minWidth: 0 }}>
            <div className="kind">{t("stash.title")}</div>
            <h3>{repo.name}</h3>
          </div>
        </>
      }
    >
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

        {selected ? (
          <StashDetailPanel repoPath={repo.path} stash={selected} />
        ) : (
          <aside className="diff-pane">
            <div className="history-status">{t("stash.selectPrompt")}</div>
          </aside>
        )}
      </div>
    </Modal>
  );
}
