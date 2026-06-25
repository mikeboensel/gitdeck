import type { IconType } from "react-icons";
import { LuHardDrive } from "react-icons/lu";
import { useI18n } from "../../i18n/I18nProvider";
import { GridIcon, ListIcon, PaddingIcon } from "../common/Icons";
import { REPO_LAYOUT_OPTIONS, type RepoDensity, type RepoLayout } from "./ReposView";

interface RepoViewControlsProps {
  layout: RepoLayout;
  density: RepoDensity;
  onLayoutChange: (layout: RepoLayout) => void;
  onCycleDensity: () => void;
  /** Which layout buttons to show. Defaults to grid/list (the Repositories tab);
   *  the Local tab passes ["grid","list","disk"] to add the disk-usage view. */
  layoutOptions?: RepoLayout[];
}

const LAYOUT_ICON: Record<RepoLayout, IconType> = {
  grid: GridIcon,
  list: ListIcon,
  disk: LuHardDrive,
};
const LAYOUT_LABEL: Record<RepoLayout, "repo.viewCards" | "repo.viewList" | "repo.viewDisk"> = {
  grid: "repo.viewCards",
  list: "repo.viewList",
  disk: "repo.viewDisk",
};

/**
 * The isolated Repos toolbar controls: a layout segmented toggle (Cards/List, plus
 * Disk on the Local tab) and a padding (density) cycle. Both keep their text
 * labels hidden until hover/focus.
 */
export function RepoViewControls({
  layout,
  density,
  onLayoutChange,
  onCycleDensity,
  layoutOptions = REPO_LAYOUT_OPTIONS,
}: RepoViewControlsProps) {
  const { t } = useI18n();
  return (
    <div className="repo-view-controls">
      <fieldset className="repo-layout-seg" aria-label={t("repo.layout")}>
        {layoutOptions.map((option) => {
          const Icon = LAYOUT_ICON[option];
          const label = t(LAYOUT_LABEL[option]);
          return (
            <button
              key={option}
              type="button"
              className={`hover-label-btn tip${layout === option ? " active" : ""}`}
              aria-pressed={layout === option}
              data-tip={label}
              onClick={() => onLayoutChange(option)}
            >
              <Icon /> <span className="label">{label}</span>
            </button>
          );
        })}
      </fieldset>
      <button
        className="hover-label-btn repo-density-btn tip"
        type="button"
        onClick={onCycleDensity}
        aria-label={`${t("repo.padding")}: ${density}`}
        data-tip={`${t("repo.padding")}: ${density}`}
      >
        <PaddingIcon density={density} /> <span className="label">{t("repo.padding")}</span>
      </button>
    </div>
  );
}
