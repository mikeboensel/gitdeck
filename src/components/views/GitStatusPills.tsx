import type { IconType } from "react-icons";
import {
  LuArchive,
  LuCircleCheck,
  LuFilePen,
  LuFilePlus,
  LuFileQuestion,
  LuTriangleAlert,
} from "react-icons/lu";
import { useStashViewer } from "../../contexts/StashViewerProvider";
import { useI18n } from "../../i18n/I18nProvider";
import type { TranslationKey } from "../../i18n/translations";
import type { GitChangeCounts, LocalRepo } from "../../types/github";

/**
 * Working-tree change categories, in display order (most urgent first). Each
 * renders as its own pill when its count is non-zero; the label is count-prefixed
 * and the title carries the full explanation.
 */
const CHANGE_PILLS: ReadonlyArray<{
  field: keyof GitChangeCounts;
  cls: string;
  icon: IconType;
  label: TranslationKey;
  title: TranslationKey;
}> = [
  {
    field: "conflicted",
    cls: "conflicted",
    icon: LuTriangleAlert,
    label: "local.changeConflicted",
    title: "local.changeConflictedTitle",
  },
  {
    field: "staged",
    cls: "staged",
    icon: LuFilePlus,
    label: "local.changeStaged",
    title: "local.changeStagedTitle",
  },
  {
    field: "modified",
    cls: "modified",
    icon: LuFilePen,
    label: "local.changeModified",
    title: "local.changeModifiedTitle",
  },
  {
    field: "untracked",
    cls: "untracked",
    icon: LuFileQuestion,
    label: "local.changeUntracked",
    title: "local.changeUntrackedTitle",
  },
];

/** The dirty/clean + ahead/behind pills, shared by the card and the compact row. */
export function GitStatusPills({ repo }: { repo: LocalRepo }) {
  const { t } = useI18n();
  const { openStashes } = useStashViewer();
  return (
    <div className="local-git-status">
      {repo.dirty ? (
        CHANGE_PILLS.filter((p) => repo.changes[p.field] > 0).map((p) => (
          <span
            key={p.field}
            className={`local-pill dirty ${p.cls} tip`}
            role="img"
            data-tip={`${repo.changes[p.field]} ${t(p.label)} — ${t(p.title)}`}
            aria-label={`${repo.changes[p.field]} ${t(p.label)}`}
          >
            <p.icon size={11} aria-hidden /> {repo.changes[p.field]}
          </span>
        ))
      ) : (
        <span
          className="local-pill clean tip"
          role="img"
          data-tip={`${t("local.clean")} — ${t("local.cleanTitle")}`}
          aria-label={t("local.clean")}
        >
          <LuCircleCheck size={11} aria-hidden />
        </span>
      )}
      {repo.ahead > 0 ? (
        <span
          className="local-pill sync tip"
          role="img"
          data-tip={`${repo.ahead} ${t("local.ahead")} — ${t("local.aheadTitle")}`}
          aria-label={`${repo.ahead} ${t("local.ahead")}`}
        >
          ↑{repo.ahead}
        </span>
      ) : null}
      {repo.behind > 0 ? (
        <span
          className="local-pill sync tip"
          role="img"
          data-tip={`${repo.behind} ${t("local.behind")} — ${t("local.behindTitle")}`}
          aria-label={`${repo.behind} ${t("local.behind")}`}
        >
          ↓{repo.behind}
        </span>
      ) : null}
      {repo.stashCount > 0 ? (
        <button
          type="button"
          className="local-pill stash tip"
          data-tip={`${repo.stashCount} ${t("local.stash")} — ${t("stash.viewStashes")}`}
          aria-label={t("stash.viewStashes")}
          onClick={(e) => {
            e.stopPropagation();
            openStashes(repo);
          }}
        >
          <LuArchive size={11} aria-hidden /> {repo.stashCount}
        </button>
      ) : null}
    </div>
  );
}
