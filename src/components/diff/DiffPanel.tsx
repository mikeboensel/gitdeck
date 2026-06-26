import { DiffModeEnum, DiffView, getLang } from "@git-diff-view/react";
import "@git-diff-view/react/styles/diff-view.css";
import { useMemo, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { type PatchFile, splitUnifiedDiff } from "../../utils/unifiedDiff";

export type DiffMode = "split" | "unified";

/**
 * One file's diff with a collapsible header. The header is the toggle (whole row
 * clickable); the body collapses to just the header so long multi-file patches
 * stay scannable. Defaults to expanded.
 */
function DiffFile({ file, viewMode }: { file: PatchFile; viewMode: DiffModeEnum }) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="diff-file">
      <button
        type="button"
        className="diff-file-name"
        title={file.path}
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((c) => !c)}
      >
        <span className={`diff-file-chevron${collapsed ? " collapsed" : ""}`} aria-hidden>
          ▾
        </span>
        <span className="diff-file-path">{file.path}</span>
      </button>
      {collapsed ? null : file.binary || !file.diff ? (
        <div className="diff-file-binary">{t("history.binary")}</div>
      ) : (
        <DiffView
          data={{
            oldFile: { fileName: file.oldPath, fileLang: getLang(file.path) },
            newFile: { fileName: file.newPath, fileLang: getLang(file.path) },
            hunks: [file.diff],
          }}
          diffViewMode={viewMode}
          diffViewTheme="dark"
          diffViewHighlight
          diffViewWrap
          diffViewFontSize={12}
        />
      )}
    </div>
  );
}

/**
 * Renders a multi-file unified diff as a stack of per-file diffs via
 * `@git-diff-view/react` (syntax highlighting + split/unified). Each file is
 * collapsible. Default-exported and code-split (`React.lazy`) by callers so the
 * highlighter (lowlight) stays out of the main bundle. The per-file split is the
 * pure {@link splitUnifiedDiff}.
 */
export default function DiffPanel({ patch, mode }: { patch: string; mode: DiffMode }) {
  const { t } = useI18n();
  const files = useMemo(() => splitUnifiedDiff(patch), [patch]);
  const viewMode = mode === "split" ? DiffModeEnum.Split : DiffModeEnum.Unified;

  if (files.length === 0) {
    return <div className="history-status">{t("history.noChanges")}</div>;
  }

  return (
    <div className="diff-files">
      {files.map((file) => (
        <DiffFile key={file.path} file={file} viewMode={viewMode} />
      ))}
    </div>
  );
}
