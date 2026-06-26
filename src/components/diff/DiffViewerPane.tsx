import { lazy, type ReactNode, Suspense, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import type { DiffMode } from "./DiffPanel";

// Code-split so the diff renderer + its highlighter (lowlight) load only when a
// diff is actually shown, keeping them out of the main bundle.
const DiffPanel = lazy(() => import("./DiffPanel"));

interface DiffViewerPaneProps {
  /** Unified diff to render, or null while it hasn't loaded / there's nothing to show. */
  patch: string | null;
  /** Left side of the header bar (branch/ref/date + changed-file count) — caller-specific. */
  meta?: ReactNode;
  loading: boolean;
  error: string;
  /** When true, show {@link emptyLabel} instead of the diff (e.g. a clean working tree). */
  empty?: boolean;
  emptyLabel?: string;
}

/**
 * The diff side of a viewer: a header (caller `meta` + a Unified/Split toggle it
 * owns) over a scrolling, per-file {@link DiffPanel}. Shared by the stash and
 * uncommitted-changes modals so the toggle, mode state, scroll container, and
 * loading/error/empty states live in exactly one place.
 */
export function DiffViewerPane({
  patch,
  meta,
  loading,
  error,
  empty,
  emptyLabel,
}: DiffViewerPaneProps) {
  const { t } = useI18n();
  const [mode, setMode] = useState<DiffMode>("unified");

  return (
    <aside className="diff-pane">
      <div className="diff-pane-head">
        <div className="diff-pane-meta">{meta}</div>
        <div className="diff-pane-mode">
          <button
            type="button"
            className={`diff-pane-mode-btn${mode === "unified" ? " active" : ""}`}
            onClick={() => setMode("unified")}
          >
            {t("diff.unified")}
          </button>
          <button
            type="button"
            className={`diff-pane-mode-btn${mode === "split" ? " active" : ""}`}
            onClick={() => setMode("split")}
          >
            {t("diff.split")}
          </button>
        </div>
      </div>

      <div className="diff-pane-scroll">
        {loading ? (
          <div className="history-status">{t("common.loading")}</div>
        ) : error ? (
          <div className="history-status error">{error}</div>
        ) : empty ? (
          <div className="history-status">{emptyLabel}</div>
        ) : patch !== null ? (
          <Suspense fallback={<div className="history-status">{t("common.loading")}</div>}>
            <DiffPanel patch={patch} mode={mode} />
          </Suspense>
        ) : null}
      </div>
    </aside>
  );
}
