import type { ContextMenuItem } from "../components/common/ContextMenu";
import { ICONS } from "../components/common/IconRegistry";
import type { Translate } from "../i18n/I18nProvider";
import type { LocalRepo } from "../types/github";
import { copyToClipboard } from "../utils/clipboard";

/**
 * Actions a local-repo right-click menu can invoke. The native "open" actions
 * are injected by the call site (they hit the backend); copy and "open on
 * GitHub" are self-contained.
 */
export interface LocalRepoMenuActions {
  /** Open the repo's folder in Finder. */
  onReveal: (repo: LocalRepo) => void;
  /** Open the repo in Cursor. */
  onOpenInCursor: (repo: LocalRepo) => void;
  /** Open the repo's folder in a new Terminal window. */
  onOpenInTerminal: (repo: LocalRepo) => void;
  /** Open the commit-history graph for the repo. */
  onViewHistory: (repo: LocalRepo) => void;
  /** Open the stash viewer for the repo. */
  onViewStashes: (repo: LocalRepo) => void;
  /** Open the uncommitted-changes viewer for the repo. */
  onViewChanges: (repo: LocalRepo) => void;
}

/**
 * Build the right-click menu items for a scanned local repo. "Open on GitHub"
 * only appears when the repo was enriched (i.e. has a reachable GitHub remote).
 */
export function buildLocalRepoMenu(
  repo: LocalRepo,
  actions: LocalRepoMenuActions,
  t: Translate,
): ContextMenuItem[] {
  const items: ContextMenuItem[] = [
    {
      key: "history",
      label: t("menu.viewHistory"),
      icon: ICONS.history,
      onSelect: () => actions.onViewHistory(repo),
    },
    {
      key: "finder",
      label: t("menu.revealInFinder"),
      icon: ICONS.revealFinder,
      onSelect: () => actions.onReveal(repo),
    },
  ];
  // Stash entries are repo-level and counted on the primary only, so the item
  // only shows where there's actually something to view.
  if (repo.stashCount > 0) {
    items.splice(1, 0, {
      key: "stashes",
      label: t("menu.viewStashes"),
      icon: ICONS.stash,
      onSelect: () => actions.onViewStashes(repo),
    });
  }
  // Outstanding working-tree changes only exist when the tree is dirty, so the
  // item is offered only then. Placed first as the most directly actionable view.
  if (repo.dirty) {
    items.unshift({
      key: "changes",
      label: t("menu.viewChanges"),
      icon: ICONS.changes,
      onSelect: () => actions.onViewChanges(repo),
    });
  }
  items.push(
    {
      key: "cursor",
      label: t("menu.openInCursor"),
      icon: ICONS.openEditor,
      onSelect: () => actions.onOpenInCursor(repo),
    },
    {
      key: "terminal",
      label: t("menu.openInTerminal"),
      icon: ICONS.openTerminal,
      onSelect: () => actions.onOpenInTerminal(repo),
    },
    {
      key: "copyPath",
      label: t("menu.copyPath"),
      icon: ICONS.copy,
      onSelect: () => copyToClipboard(repo.path, t("toast.copied")),
    },
  );
  if (repo.enrichment) {
    const url = repo.enrichment.url;
    items.push({
      key: "github",
      label: t("menu.openOnGitHub"),
      icon: ICONS.openExternal,
      onSelect: () => window.open(url, "_blank", "noopener,noreferrer"),
    });
  }
  return items;
}
