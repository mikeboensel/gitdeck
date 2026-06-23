import { useEffect, useState } from "react";
import {
  type BrowseDirEntry,
  browseDirectories,
  cloneRepository,
  fetchLocalReposConfig,
} from "../../api/github";
import { useI18n } from "../../i18n/I18nProvider";
import type { GhRepo } from "../../types/github";
import { errorMessage } from "../../utils/errors";
import { ChevronIcon, CloseIcon, FolderIcon } from "../common/Icons";

interface CloneRepoModalProps {
  repo: GhRepo;
  onClose: () => void;
}

/**
 * Destination picker for cloning a remote repo. Since the browser has no native
 * folder dialog that yields a real server path, the server exposes a directory
 * browser (`/api/local-repos/browse`, confined to ~); this modal walks it and
 * posts the chosen folder to `/api/local-repos/clone`.
 */
export function CloneRepoModal({ repo, onClose }: CloneRepoModalProps) {
  const { t } = useI18n();
  const [path, setPath] = useState<string | null>(null);
  const [parent, setParent] = useState<string | null>(null);
  const [entries, setEntries] = useState<BrowseDirEntry[]>([]);
  const [roots, setRoots] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [browseError, setBrowseError] = useState("");
  const [cloning, setCloning] = useState(false);
  const [cloneError, setCloneError] = useState("");

  // Quick-pick chips: the user's configured scan roots.
  useEffect(() => {
    fetchLocalReposConfig()
      .then((r) => setRoots(r.config.scanRoots))
      .catch(() => setRoots([]));
  }, []);

  // Re-list whenever the target directory changes (null ⇒ home, the server default).
  useEffect(() => {
    let active = true;
    setLoading(true);
    setBrowseError("");
    browseDirectories(path ?? undefined)
      .then((r) => {
        if (!active) return;
        setPath(r.path);
        setParent(r.parent);
        setEntries(r.entries);
      })
      .catch((err: unknown) => active && setBrowseError(errorMessage(err)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [path]);

  const clone = () => {
    if (!path) return;
    setCloning(true);
    setCloneError("");
    cloneRepository({ nameWithOwner: repo.nameWithOwner, url: repo.url, destDir: path })
      .then(onClose)
      .catch((err: unknown) => {
        setCloneError(errorMessage(err));
        setCloning(false);
      });
  };

  return (
    <div className="modal-root">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-close; keyboard users close via the visible Close button */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click-to-close; keyboard users close via the visible Close button */}
      <div className="modal-backdrop" onClick={cloning ? undefined : onClose} />
      <div
        className="modal clone-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t("clone.title")}
      >
        <header className="modal-head">
          <div className="modal-title">
            <span className="modal-icon repository">⤓</span>
            <div style={{ minWidth: 0 }}>
              <div className="kind">{t("clone.title")}</div>
              <h3>{repo.nameWithOwner}</h3>
            </div>
          </div>
          <button
            type="button"
            className="modal-close"
            aria-label={t("common.close")}
            onClick={onClose}
            disabled={cloning}
          >
            <CloseIcon />
          </button>
        </header>

        <div className="clone-body">
          <div className="clone-label">{t("clone.chooseDir")}</div>

          {roots.length ? (
            <div className="clone-chips">
              {roots.map((r) => (
                <button
                  key={r}
                  type="button"
                  className="clone-chip"
                  title={r}
                  onClick={() => setPath(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          ) : null}

          <div className="clone-crumb">
            <FolderIcon />
            <span className="clone-crumb-path" title={path ?? ""}>
              {path ?? t("common.loading")}
            </span>
          </div>

          <ul className="clone-dirs">
            <li>
              <button
                type="button"
                className="clone-dir clone-dir-up"
                onClick={() => parent && setPath(parent)}
                disabled={!parent || loading}
              >
                <span className="clone-up-icon">
                  <ChevronIcon />
                </span>
                {t("clone.up")}
              </button>
            </li>
            {entries.map((e) => (
              <li key={e.path}>
                <button
                  type="button"
                  className="clone-dir"
                  onClick={() => setPath(e.path)}
                  disabled={loading}
                >
                  <FolderIcon />
                  {e.name}
                </button>
              </li>
            ))}
            {!loading && !entries.length ? (
              <li className="clone-empty">{t("clone.empty")}</li>
            ) : null}
          </ul>

          {browseError ? <div className="clone-error">{browseError}</div> : null}
        </div>

        <footer className="clone-foot">
          <div className="clone-target" title={path ? `${path}/${repo.name}` : ""}>
            {path ? t("clone.target", { path: `${path}/${repo.name}` }) : ""}
          </div>
          <div className="clone-foot-actions">
            {cloneError ? <span className="clone-error">{cloneError}</span> : null}
            <button type="button" className="btn ghost" onClick={onClose} disabled={cloning}>
              {t("clone.cancel")}
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={clone}
              disabled={!path || loading || cloning}
            >
              {cloning ? t("clone.cloning") : t("clone.cloneHere")}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
