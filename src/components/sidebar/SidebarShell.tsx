import type { ReactNode } from "react";
import { LuChevronLeft } from "react-icons/lu";
import { useI18n } from "../../i18n/I18nProvider";

/**
 * Shared chrome for every filter sidebar: a sticky bordered box whose content
 * scrolls in an inner wrapper, plus a full-height collapse handle running down
 * the right edge. Keeping the scroll on the inner element lets the handle sit on
 * the sidebar's edge at any height without being clipped or scrolling away.
 */
export function SidebarShell({
  onCollapse,
  children,
}: {
  onCollapse: () => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <aside className="sidebar" id="sidebar">
      <div className="sidebar-scroll">{children}</div>
      <button
        type="button"
        className="sidebar-collapse-edge tip"
        data-tip={t("common.collapseFilters")}
        aria-label={t("common.collapseFilters")}
        onClick={onCollapse}
      >
        <LuChevronLeft size={16} />
      </button>
    </aside>
  );
}
