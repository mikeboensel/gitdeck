import type { ContextMenuItem } from "../components/common/ContextMenu";
import type { GhRepo } from "../types/github";
import type { TranslationKey } from "../i18n/translations";

/**
 * Actions a repo right-click menu can invoke. Injected by the call site so the
 * same builder serves every repo representation (grid card, list row, …).
 */
export interface RepoMenuActions {
  /** Open the repository details modal. */
  onOpen: (repo: GhRepo) => void;
  /** Jump to the repository's issues. */
  onViewIssues: (repo: GhRepo) => void;
}

/**
 * Build the right-click menu items for a repository. Read-only actions only —
 * "open on GitHub" and the copy actions are self-contained.
 */
export function buildRepoMenu(
  repo: GhRepo,
  actions: RepoMenuActions,
  t: (key: TranslationKey) => string,
): ContextMenuItem[] {
  return [
    { key: "open", label: t("menu.openDetails"), onSelect: () => actions.onOpen(repo) },
    { key: "issues", label: t("menu.viewIssues"), onSelect: () => actions.onViewIssues(repo) },
    {
      key: "github",
      label: t("menu.openOnGitHub"),
      onSelect: () => window.open(repo.url, "_blank", "noopener,noreferrer"),
    },
    {
      key: "copyName",
      label: t("menu.copyName"),
      onSelect: () => void navigator.clipboard?.writeText(repo.nameWithOwner),
    },
    {
      key: "copyUrl",
      label: t("menu.copyUrl"),
      onSelect: () => void navigator.clipboard?.writeText(repo.url),
    },
  ];
}
