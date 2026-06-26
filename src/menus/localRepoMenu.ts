import type { ContextMenuItem } from "../components/common/ContextMenu";
import type { TranslationKey } from "../i18n/translations";
import type { LocalRepo } from "../types/github";

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
}

/**
 * Build the right-click menu items for a scanned local repo. "Open on GitHub"
 * only appears when the repo was enriched (i.e. has a reachable GitHub remote).
 */
export function buildLocalRepoMenu(
  repo: LocalRepo,
  actions: LocalRepoMenuActions,
  t: (key: TranslationKey) => string,
): ContextMenuItem[] {
  const items: ContextMenuItem[] = [
    {
      key: "history",
      label: t("menu.viewHistory"),
      onSelect: () => actions.onViewHistory(repo),
    },
    { key: "finder", label: t("menu.revealInFinder"), onSelect: () => actions.onReveal(repo) },
  ];
  // Stash entries are repo-level and counted on the primary only, so the item
  // only shows where there's actually something to view.
  if (repo.stashCount > 0) {
    items.splice(1, 0, {
      key: "stashes",
      label: t("menu.viewStashes"),
      onSelect: () => actions.onViewStashes(repo),
    });
  }
  items.push(
    { key: "cursor", label: t("menu.openInCursor"), onSelect: () => actions.onOpenInCursor(repo) },
    {
      key: "terminal",
      label: t("menu.openInTerminal"),
      onSelect: () => actions.onOpenInTerminal(repo),
    },
    {
      key: "copyPath",
      label: t("menu.copyPath"),
      onSelect: () => void navigator.clipboard?.writeText(repo.path),
    },
  );
  if (repo.enrichment) {
    const url = repo.enrichment.url;
    items.push({
      key: "github",
      label: t("menu.openOnGitHub"),
      onSelect: () => window.open(url, "_blank", "noopener,noreferrer"),
    });
  }
  return items;
}
