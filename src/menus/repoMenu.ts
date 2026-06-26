import type { ContextMenuItem } from "../components/common/ContextMenu";
import { ICONS } from "../components/common/IconRegistry";
import type { Translate } from "../i18n/I18nProvider";
import type { GhRepo } from "../types/github";
import { copyToClipboard } from "../utils/clipboard";

/**
 * Actions a repo right-click menu can invoke. Injected by the call site so the
 * same builder serves every repo representation (grid card, list row, …).
 */
export interface RepoMenuActions {
  /** Open the repository details modal. */
  onOpen: (repo: GhRepo) => void;
  /** Jump to the repository's issues. */
  onViewIssues: (repo: GhRepo) => void;
  /** Open the clone-destination picker for the repository. */
  onClone: (repo: GhRepo) => void;
}

/**
 * Build the right-click menu items for a repository. Read-only actions only —
 * "open on GitHub" and the copy actions are self-contained.
 */
export function buildRepoMenu(
  repo: GhRepo,
  actions: RepoMenuActions,
  t: Translate,
): ContextMenuItem[] {
  return [
    {
      key: "open",
      label: t("menu.openDetails"),
      icon: ICONS.details,
      onSelect: () => actions.onOpen(repo),
    },
    {
      key: "issues",
      label: t("menu.viewIssues"),
      icon: ICONS.issues,
      onSelect: () => actions.onViewIssues(repo),
    },
    {
      key: "clone",
      label: t("menu.clone"),
      icon: ICONS.clone,
      onSelect: () => actions.onClone(repo),
    },
    {
      key: "github",
      label: t("menu.openOnGitHub"),
      icon: ICONS.openExternal,
      onSelect: () => window.open(repo.url, "_blank", "noopener,noreferrer"),
    },
    {
      key: "copyName",
      label: t("menu.copyName"),
      icon: ICONS.copy,
      onSelect: () => copyToClipboard(repo.nameWithOwner, t("toast.copied")),
    },
    {
      key: "copyUrl",
      label: t("menu.copyUrl"),
      icon: ICONS.copyLink,
      onSelect: () => copyToClipboard(repo.url, t("toast.copied")),
    },
  ];
}
