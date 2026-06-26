import { lazy, Suspense, useMemo, useState } from "react";
import { LuChevronRight, LuFolderOpen, LuTrash2 } from "react-icons/lu";
import { useI18n } from "../../i18n/I18nProvider";
import type { TranslationKey } from "../../i18n/translations";
import type { LocalRepo } from "../../types/github";
import { buildDiskUsage, type DiskWedge, OTHER_KEY } from "../../utils/diskUsage";
import { formatBytes, formatRelativeTime } from "../../utils/format";
import { type LocalUnit, liveWorktrees, type SafetyBlocker } from "../../utils/localRepos";
import type { DiskChartDatum } from "./LocalDiskUsageInner";

const ChartInner = lazy(() => import("./LocalDiskUsageInner"));

/** One line in a cluster's worktree breakdown: the primary working copy or a worktree. */
interface BreakdownItem {
  label: string;
  path: string;
  sizeBytes: number | null;
  prunable: boolean;
  isPrimary: boolean;
}

const lastSegment = (path: string) => path.split("/").filter(Boolean).pop() ?? path;

const BLOCKER_KEY: Record<SafetyBlocker, TranslationKey> = {
  dirty: "blocker.dirty",
  unpushed: "blocker.unpushed",
  "no-remote": "blocker.noRemote",
  "linked-worktrees": "blocker.linkedWorktrees",
  "is-worktree": "blocker.isWorktree",
};

interface LocalDiskUsageProps {
  /** Facet-filtered repos (the chart states its scope in the header). */
  repos: LocalRepo[];
  /** Reveal a repo's folder in Finder. */
  onReveal: (path: string) => void;
  /** Move a cluster to the Trash. */
  onDelete: (path: string, memberPaths: string[], force: boolean) => Promise<void>;
}

/** All checkout paths in a cluster — dropped together on delete. */
function memberPaths(unit: LocalUnit): string[] {
  return [unit.primary.path, ...unit.worktrees.map((w) => w.path)];
}

/**
 * Disk-usage view for the Local tab: a donut of on-disk size (one slice per repo
 * cluster, top-N + "Other") plus a companion table with per-repo safe-to-delete
 * status, Reveal, and Move-to-Trash. Owns i18n/formatting; defers the Recharts
 * donut to a lazy inner component.
 */
export function LocalDiskUsage({ repos, onReveal, onDelete }: LocalDiskUsageProps) {
  const { language, t } = useI18n();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const model = useMemo(() => buildDiskUsage(repos), [repos]);

  const toggleExpanded = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const blockerLabels = (unit: LocalUnit, blockers: SafetyBlocker[]): string[] =>
    blockers.map((b) => {
      if (b === "unpushed") {
        const count = [unit.primary, ...unit.worktrees].reduce((sum, m) => sum + m.ahead, 0);
        return t("blocker.unpushed", { count });
      }
      if (b === "linked-worktrees") {
        return t("blocker.linkedWorktrees", { count: liveWorktrees(unit).length });
      }
      return t(BLOCKER_KEY[b]);
    });

  // Per-cluster disk breakdown: the primary working copy followed by every
  // git-registered worktree (prunable ones included so they can be cleaned up).
  const breakdownItems = (unit: LocalUnit): BreakdownItem[] => [
    {
      label: t("local.disk.workingCopy"),
      path: unit.primary.path,
      sizeBytes: unit.primary.sizeBytes,
      prunable: false,
      isPrimary: true,
    },
    ...unit.primary.linkedWorktrees.map((w) => ({
      label: w.branch ?? lastSegment(w.path),
      path: w.path,
      sizeBytes: w.sizeBytes,
      prunable: w.prunable,
      isPrimary: false,
    })),
  ];

  const percent = (bytes: number) => (model.totalBytes > 0 ? (bytes / model.totalBytes) * 100 : 0);
  const percentLabel = (bytes: number) =>
    t("local.disk.percentOfTotal", { percent: percent(bytes).toFixed(1) });

  // Stable identity across hover-driven re-renders (setActiveKey fires on every
  // slice/row mouse move). A fresh array each render would restart the Recharts
  // donut animation, causing visible choppiness — so memoize on the inputs that
  // actually affect the slices: the model and i18n.
  // biome-ignore lint/correctness/useExhaustiveDependencies: percentLabel/blockerLabels are pure per-render closures over `model` + `t`; listing them would recreate the array every render and defeat the memo — `model`, `t`, `language` are the real inputs.
  const chartData: DiskChartDatum[] = useMemo(
    () =>
      model.wedges.map((w) => {
        const isOther = w.key === OTHER_KEY;
        const safety = w.safety;
        return {
          key: w.key,
          name: isOther ? t("local.disk.other", { count: model.otherCount }) : w.name,
          bytes: w.bytes,
          color: w.color,
          sizeLabel: formatBytes(w.bytes),
          percentLabel: percentLabel(w.bytes),
          pathLabel: w.unit?.primary.path,
          statusLabel: safety
            ? safety.safe
              ? t("local.disk.safe")
              : t("local.disk.unsafe")
            : undefined,
          safe: safety?.safe,
          reasonLabels: w.unit && safety ? blockerLabels(w.unit, safety.blockers) : [],
          committedLabel: w.unit?.primary.lastCommit
            ? formatRelativeTime(w.unit.primary.lastCommit.date, Date.now(), language)
            : undefined,
        };
      }),
    [model, t, language],
  );

  async function handleDelete(wedge: DiskWedge) {
    const unit = wedge.unit;
    if (!unit) return;
    const unsafe = wedge.safety ? !wedge.safety.safe : false;
    const name = unit.primary.name;
    const message = unsafe
      ? t("local.disk.deleteConfirmUnsafe", {
          name,
          reasons: blockerLabels(unit, wedge.safety?.blockers ?? []).join(", "),
        })
      : t("local.disk.deleteConfirm", { name });
    if (!window.confirm(message)) return;
    try {
      await onDelete(unit.primary.path, memberPaths(unit), unsafe);
    } catch {
      // App-level handler surfaces the error in the toolbar.
    }
  }

  if (model.measuredCount === 0) {
    return <div className="local-disk-empty">{t("local.disk.empty")}</div>;
  }

  return (
    <div className="local-disk">
      <div className="local-disk-head">
        <h3 className="local-disk-title">{t("local.disk.title")}</h3>
        <span className="local-disk-total">
          {t("local.disk.totalSummary", {
            size: formatBytes(model.totalBytes),
            count: model.measuredCount,
          })}
        </span>
      </div>

      <div className="local-disk-body">
        <div className="local-disk-chart">
          <Suspense
            fallback={<div className="local-disk-empty">{t("common.loadingEllipsis")}</div>}
          >
            <ChartInner data={chartData} onActiveChange={setActiveKey} />
          </Suspense>
        </div>

        <ul className="local-disk-table">
          {model.wedges.map((w) => {
            const datum = chartData.find((d) => d.key === w.key);
            const isOther = w.key === OTHER_KEY;
            const safe = w.safety?.safe;
            const worktreeCount = w.unit ? w.unit.primary.linkedWorktrees.length : 0;
            const isExpanded = expanded.has(w.key);
            return (
              <li
                className="local-disk-item"
                key={w.key}
                onMouseEnter={() => setActiveKey(w.key)}
                onMouseLeave={() => setActiveKey(null)}
              >
                <div className={`local-disk-row${activeKey === w.key ? " active" : ""}`}>
                  {worktreeCount > 0 ? (
                    <button
                      type="button"
                      className="local-disk-expand"
                      aria-expanded={isExpanded}
                      aria-label={t("local.disk.toggleBreakdown")}
                      onClick={() => toggleExpanded(w.key)}
                    >
                      <LuChevronRight size={13} className={isExpanded ? "open" : ""} />
                    </button>
                  ) : (
                    <span className="local-disk-expand-spacer" aria-hidden />
                  )}
                  <span className="local-disk-swatch" style={{ background: w.color }} aria-hidden />
                  <span className="local-disk-name" title={w.unit?.primary.path}>
                    {datum?.name}
                    {worktreeCount > 0 ? (
                      <span className="local-disk-wt-badge">
                        {t("local.disk.worktreeBadge", { count: worktreeCount })}
                      </span>
                    ) : null}
                  </span>
                  <span className="local-disk-size">{formatBytes(w.bytes)}</span>
                  <span className="local-disk-pct">{percentLabel(w.bytes)}</span>
                  {isOther ? (
                    <span className="local-disk-actions" />
                  ) : (
                    <>
                      <span
                        className={`local-disk-status ${safe ? "safe" : "unsafe"}`}
                        title={datum?.reasonLabels.join(", ")}
                      >
                        {safe ? t("local.disk.safe") : t("local.disk.unsafe")}
                      </span>
                      <span className="local-disk-actions">
                        <button
                          type="button"
                          className="btn icon-btn tip"
                          data-tip={t("local.disk.reveal")}
                          aria-label={t("local.disk.reveal")}
                          onClick={() => w.unit && onReveal(w.unit.primary.path)}
                        >
                          <LuFolderOpen size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn icon-btn local-disk-delete tip"
                          data-tip={t("local.disk.delete")}
                          aria-label={t("local.disk.delete")}
                          onClick={() => void handleDelete(w)}
                        >
                          <LuTrash2 size={14} />
                        </button>
                      </span>
                    </>
                  )}
                </div>
                {isExpanded && w.unit ? (
                  <ul
                    className="local-disk-breakdown"
                    aria-label={t("local.disk.worktreeBreakdown")}
                  >
                    {breakdownItems(w.unit).map((item) => (
                      <li className="local-disk-sub" key={item.path}>
                        <span className="local-disk-sub-bar" aria-hidden>
                          <span
                            className="local-disk-sub-fill"
                            style={{
                              width: `${w.bytes > 0 && item.sizeBytes ? (item.sizeBytes / w.bytes) * 100 : 0}%`,
                              background: w.color,
                            }}
                          />
                        </span>
                        <span
                          className={`local-disk-sub-name${item.isPrimary ? " primary" : ""}`}
                          title={item.path}
                        >
                          {item.label}
                        </span>
                        {item.prunable ? (
                          <span className="local-disk-sub-prunable">
                            {t("local.disk.prunable")}
                          </span>
                        ) : (
                          <span className="local-disk-sub-size">
                            {item.sizeBytes != null ? formatBytes(item.sizeBytes) : "—"}
                          </span>
                        )}
                        <button
                          type="button"
                          className="btn icon-btn tip local-disk-sub-reveal"
                          data-tip={t("local.disk.reveal")}
                          aria-label={t("local.disk.reveal")}
                          disabled={item.prunable}
                          onClick={() => onReveal(item.path)}
                        >
                          <LuFolderOpen size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      {model.unmeasuredCount > 0 ? (
        <p className="local-disk-footnote">
          {t("local.disk.unmeasured", { count: model.unmeasuredCount })}
        </p>
      ) : null}
    </div>
  );
}
