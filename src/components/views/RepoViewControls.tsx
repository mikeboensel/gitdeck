import { useI18n } from "../../i18n/I18nProvider";
import { GridIcon, ListIcon, PaddingIcon } from "../common/Icons";
import { REPO_LAYOUT_OPTIONS, type RepoDensity, type RepoLayout } from "./ReposView";

interface RepoViewControlsProps {
  layout: RepoLayout;
  density: RepoDensity;
  onLayoutChange: (layout: RepoLayout) => void;
  onCycleDensity: () => void;
}

/**
 * The two isolated Repos toolbar controls: a Cards/List segmented toggle and a
 * padding (density) cycle. Both keep their text labels hidden until hover/focus.
 */
export function RepoViewControls({ layout, density, onLayoutChange, onCycleDensity }: RepoViewControlsProps) {
  const { t } = useI18n();
  return (
    <div className="repo-view-controls">
      <div className="repo-layout-seg" role="group" aria-label={t("repo.layout")}>
        {REPO_LAYOUT_OPTIONS.map((option) => {
          const Icon = option === "list" ? ListIcon : GridIcon;
          const label = option === "list" ? t("repo.viewList") : t("repo.viewCards");
          return (
            <button
              key={option}
              type="button"
              className={`hover-label-btn${layout === option ? " active" : ""}`}
              aria-pressed={layout === option}
              title={label}
              onClick={() => onLayoutChange(option)}
            >
              <Icon /> <span className="label">{label}</span>
            </button>
          );
        })}
      </div>
      <button
        className="hover-label-btn repo-density-btn"
        type="button"
        onClick={onCycleDensity}
        aria-label={`${t("repo.padding")}: ${density}`}
        title={`${t("repo.padding")}: ${density}`}
      >
        <PaddingIcon density={density} /> <span className="label">{t("repo.padding")}</span>
      </button>
    </div>
  );
}
