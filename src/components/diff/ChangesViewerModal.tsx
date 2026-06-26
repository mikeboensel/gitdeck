import { useEffect, useState } from "react";
import { LuGitBranch } from "react-icons/lu";
import { fetchLocalChanges } from "../../api/github";
import { useI18n } from "../../i18n/I18nProvider";
import type { LocalChangesDetail, LocalRepo } from "../../types/github";
import { errorMessage } from "../../utils/errors";
import { Modal } from "../common/Modal";
import { DiffViewerPane } from "./DiffViewerPane";

interface ChangesViewerModalProps {
  repo: LocalRepo;
  onClose: () => void;
}

/**
 * Full-screen viewer for one local repo's uncommitted changes. A single pane shows
 * the complete working-tree diff vs HEAD (staged + unstaged + untracked), rendered
 * per-file with a split/unified toggle. Read-only — mirrors {@link StashViewerModal}
 * but without a stack to choose from, since the working tree is a single snapshot.
 */
export function ChangesViewerModal({ repo, onClose }: ChangesViewerModalProps) {
  const { t } = useI18n();
  const [detail, setDetail] = useState<LocalChangesDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetchLocalChanges(repo.path, controller.signal)
      .then((data) => !controller.signal.aborted && setDetail(data))
      .catch((err: unknown) => !controller.signal.aborted && setError(errorMessage(err)))
      .finally(() => !controller.signal.aborted && setLoading(false));
    return () => controller.abort();
  }, [repo.path]);

  const isEmpty = detail !== null && detail.files.length === 0;

  return (
    <Modal
      className="history-modal"
      ariaLabel={t("changes.title")}
      onClose={onClose}
      title={
        <>
          <span className="modal-icon repository">±</span>
          <div style={{ minWidth: 0 }}>
            <div className="kind">{t("changes.title")}</div>
            <h3>{repo.name}</h3>
          </div>
        </>
      }
    >
      <div className="history-body">
        <DiffViewerPane
          patch={detail?.patch ?? null}
          loading={loading}
          error={error}
          empty={isEmpty}
          emptyLabel={t("changes.empty")}
          meta={
            <>
              {repo.branch ? (
                <span className="local-branch">
                  <LuGitBranch size={11} aria-hidden /> {repo.branch}
                </span>
              ) : null}
              {detail ? (
                <span className="diff-pane-count">
                  {t("history.changedFiles", { count: detail.files.length })}
                </span>
              ) : null}
            </>
          }
        />
      </div>
    </Modal>
  );
}
