import { LuArrowDownUp } from "react-icons/lu";
import { useI18n } from "../../i18n/I18nProvider";
import type { TranslationKey } from "../../i18n/translations";

export interface SortOption {
  value: string;
  /** i18n key for the option's visible label. */
  label: TranslationKey;
}

interface SortSelectProps {
  /** Unique id tying the icon label to its <select> (one per view). */
  id: string;
  value: string;
  options: readonly SortOption[];
  onChange: (value: string) => void;
}

/**
 * The standard sort control: an icon-only label (hover reveals "Sort") next to
 * a <select> of options. Replaces the per-view sort markup that was duplicated
 * across the issues, PRs, repos, CI, and local-repos toolbars.
 */
export function SortSelect({ id, value, options, onChange }: SortSelectProps) {
  const { t } = useI18n();
  return (
    <>
      <label htmlFor={id} className="sort-label tip" data-tip={t("common.sort")}>
        <LuArrowDownUp size={14} aria-label={t("common.sort")} />
      </label>
      <select
        id={id}
        className="sort"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {t(option.label)}
          </option>
        ))}
      </select>
    </>
  );
}
