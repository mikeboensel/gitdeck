import type { ReactNode } from "react";
import { LuEraser, LuListFilter } from "react-icons/lu";
import { useI18n } from "../../i18n/I18nProvider";
import type { FacetValue } from "../../utils/dashboard";
import { CloseIcon, SearchIcon } from "../common/Icons";
import { CheckList, FacetChips, FilterSection } from "./primitives";
import { SidebarShell } from "./SidebarShell";

/**
 * One collapsible facet section. The caller supplies the data and the toggle
 * callbacks; the component is agnostic about what the facet represents.
 */
export interface FacetGroup {
  key: string;
  title: string;
  icon?: ReactNode;
  entries: Array<[string, FacetValue]>;
  selected: Set<string>;
  onToggle: (value: string) => void;
  onClear: () => void;
  /** "chips" for glyph facets (avatars/logos), "check" for a labelled list. Default "check". */
  render?: "chips" | "check";
  /** Chip glyph renderer (required when render === "chips"). */
  renderIcon?: (name: string) => ReactNode;
  /** Humanize the displayed label while keeping the raw value (e.g. long remote URLs). */
  labelFor?: (name: string) => string;
  /** Pin the section open regardless of selection. */
  open?: boolean;
}

interface FacetSidebarProps {
  search: string;
  searchPlaceholder?: string;
  onSearchChange: (value: string) => void;
  groups: FacetGroup[];
  /** Non-facet controls rendered after the groups (e.g. a status radio). */
  extraSections?: ReactNode;
  onReset: () => void;
  onClose: () => void;
  onCollapse: () => void;
}

/**
 * Data-agnostic faceted filter sidebar. Each consumer hands it a list of
 * `FacetGroup`s (built from whatever data source) plus optional `extraSections`;
 * rendering reuses the shared `FilterSection` / `CheckList` / `FacetChips`
 * primitives so it matches `SidebarControls` pixel-for-pixel.
 */
export function FacetSidebar({
  search,
  searchPlaceholder,
  onSearchChange,
  groups,
  extraSections,
  onReset,
  onClose,
  onCollapse,
}: FacetSidebarProps) {
  const { t } = useI18n();
  return (
    <SidebarShell onCollapse={onCollapse}>
      <div className="side-head">
        <h2 className="tip" data-tip={t("common.filters")} aria-label={t("common.filters")}>
          <LuListFilter size={16} />
        </h2>
        <button
          type="button"
          className="reset tip"
          data-tip={t("common.clearAll")}
          aria-label={t("common.clearAll")}
          onClick={onReset}
        >
          <LuEraser size={16} />
        </button>
        <button
          type="button"
          className="side-close"
          aria-label={t("common.closeFilters")}
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>

      <div className="search-wrap">
        <label className="search-input">
          <SearchIcon />
          <input
            type="search"
            placeholder={searchPlaceholder ?? t("sidebar.search")}
            autoComplete="off"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </label>
      </div>

      {groups.map((group) => (
        <FilterSection
          key={group.key}
          title={group.title}
          icon={group.icon}
          activeCount={group.selected.size}
          open={group.open}
          onClear={group.onClear}
        >
          {group.render === "chips" && group.renderIcon ? (
            <FacetChips
              entries={group.entries}
              selected={group.selected}
              renderIcon={group.renderIcon}
              onToggle={group.onToggle}
            />
          ) : (
            <CheckList
              entries={group.entries}
              selected={group.selected}
              onToggle={group.onToggle}
              labelFor={group.labelFor}
            />
          )}
        </FilterSection>
      ))}

      {extraSections}
    </SidebarShell>
  );
}
