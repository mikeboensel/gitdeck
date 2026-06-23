import { type ReactNode, useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import type { FacetValue } from "../../utils/dashboard";
import { formatNumber } from "../../utils/format";
import { ChevronIcon } from "../common/Icons";
import { LanguageIcon } from "../common/LanguageIcon";

/**
 * Data-agnostic sidebar primitives shared by every faceted sidebar
 * (`SidebarControls` for GitHub data, `FacetSidebar` for arbitrary sources).
 * None of these know what a "repo" or "issue" is — they render `[name, count]`
 * entries against a selected `Set` and report toggles.
 */

/** Add/remove a value in a Set, returning a new Set (immutable update). */
export function toggleSetValue(values: Set<string>, value: string): Set<string> {
  const next = new Set(values);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

/** Numeric count from a facet value (which may carry extra metadata like a color). */
export function countOf(value: FacetValue): number {
  return typeof value === "number" ? value : value.count;
}

export function CheckList({
  entries,
  selected,
  onToggle,
  showSwatch,
  languageDot,
  showGhAvatar,
  userLogin,
}: {
  entries: Array<[string, FacetValue]>;
  selected: Set<string>;
  onToggle: (value: string) => void;
  showSwatch?: boolean;
  languageDot?: boolean;
  showGhAvatar?: boolean;
  userLogin?: string;
}) {
  const { t } = useI18n();
  // Original sort (checked first, then by count, then alphabetical) with one addition:
  // when userLogin is set, the user's personal account always sorts last (orgs first).
  const sorted = [...entries].sort((a, b) => {
    if (userLogin) {
      if (a[0] === userLogin && b[0] !== userLogin) return 1;
      if (b[0] === userLogin && a[0] !== userLogin) return -1;
    }
    return (
      Number(selected.has(b[0])) - Number(selected.has(a[0])) ||
      countOf(b[1]) - countOf(a[1]) ||
      a[0].localeCompare(b[0])
    );
  });
  if (!sorted.length)
    return (
      <div style={{ padding: 8, color: "var(--muted-2)", fontSize: 12 }}>
        {t("common.noMatches")}
      </div>
    );

  return (
    <div className="check-list">
      {sorted.map(([name, value]) => {
        const color = typeof value === "number" ? undefined : value.color;
        return (
          <label className="check" key={name}>
            <input type="checkbox" checked={selected.has(name)} onChange={() => onToggle(name)} />
            {showSwatch && color ? (
              <span className="label-swatch" style={{ background: `#${color}` }} />
            ) : null}
            {languageDot ? <LanguageIcon name={name} /> : null}
            {showGhAvatar ? (
              <img
                src={`https://github.com/${name}.png?size=32`}
                alt=""
                style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0 }}
              />
            ) : null}
            <span className="label-text">{name}</span>
            <span className="label-count">{countOf(value)}</span>
          </label>
        );
      })}
    </div>
  );
}

// Dense, clickable facet chips: an icon/avatar with the count beneath it and
// the full name on hover. Used for any facet whose values have a recognizable
// glyph (language logos, GitHub avatars).
export function FacetChips({
  entries,
  selected,
  onToggle,
  renderIcon,
  labelFor,
  userLogin,
}: {
  entries: Array<[string, FacetValue]>;
  selected: Set<string>;
  onToggle: (value: string) => void;
  renderIcon: (name: string) => ReactNode;
  labelFor?: (name: string) => string;
  userLogin?: string;
}) {
  const { t } = useI18n();
  const sorted = [...entries].sort((a, b) => {
    // Keep the user's own account/org last, like CheckList does.
    if (userLogin) {
      if (a[0] === userLogin && b[0] !== userLogin) return 1;
      if (b[0] === userLogin && a[0] !== userLogin) return -1;
    }
    return (
      Number(selected.has(b[0])) - Number(selected.has(a[0])) ||
      countOf(b[1]) - countOf(a[1]) ||
      a[0].localeCompare(b[0])
    );
  });
  if (!sorted.length)
    return (
      <div style={{ padding: 8, color: "var(--muted-2)", fontSize: 12 }}>
        {t("common.noMatches")}
      </div>
    );
  return (
    <div className="facet-chips">
      {sorted.map(([name, value]) => {
        const count = countOf(value);
        const label = labelFor ? labelFor(name) : name;
        const isSel = selected.has(name);
        return (
          <button
            key={name}
            type="button"
            className={`facet-chip tip ${isSel ? "active" : ""}`}
            data-tip={label}
            aria-label={`${label} (${count})`}
            aria-pressed={isSel}
            onClick={() => onToggle(name)}
          >
            {renderIcon(name)}
            <span className="facet-chip-count">{formatNumber(count)}</span>
          </button>
        );
      })}
    </div>
  );
}

export function FilterSection({
  title,
  icon,
  activeCount,
  children,
  dataFor,
  open = false,
  onClear,
}: {
  title: string;
  icon?: ReactNode;
  activeCount: number;
  children: ReactNode;
  dataFor?: string;
  open?: boolean;
  onClear?: () => void;
}) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(open || activeCount > 0);
  const prevActiveCountRef = useRef(activeCount);
  // Auto-open when filters become active, but never auto-close — the user may
  // want to deselect the last item and pick a different one without the panel
  // collapsing on them (issue #12). Sections passed `open` (Organizations,
  // Visibility, Options) stay pinned open as before.
  useEffect(() => {
    const prev = prevActiveCountRef.current;
    prevActiveCountRef.current = activeCount;
    if (prev === 0 && activeCount > 0) setIsOpen(true);
  }, [activeCount]);
  const effectiveOpen = open || isOpen;
  const clearable = activeCount > 0 && Boolean(onClear);
  return (
    <details
      className="section"
      data-for={dataFor}
      open={effectiveOpen}
      onToggle={(event) => {
        const next = (event.currentTarget as HTMLDetailsElement).open;
        if (open && !next) return;
        setIsOpen(next);
      }}
    >
      <summary
        className={icon ? "tip" : undefined}
        data-tip={icon ? title : undefined}
        aria-label={icon ? title : undefined}
      >
        <ChevronIcon />
        {icon ? (
          <span className="section-icon" aria-hidden="true">
            {icon}
          </span>
        ) : (
          title
        )}
        {clearable ? (
          <button
            type="button"
            className="count active clearable"
            aria-label={`${t("common.clear")} ${title}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClear?.();
            }}
          >
            <span className="count-num">{activeCount}</span>
            <span className="count-clear">{t("common.clearAll")}</span>
          </button>
        ) : (
          <span className={`count ${activeCount ? "active" : ""}`}>{activeCount}</span>
        )}
      </summary>
      <div className="section-body">{children}</div>
    </details>
  );
}
