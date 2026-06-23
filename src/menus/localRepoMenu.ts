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
    { key: "finder", label: t("menu.revealInFinder"), onSelect: () => actions.onReveal(repo) },
    { key: "cursor", label: t("menu.openInCursor"), onSelect: () => actions.onOpenInCursor(repo) },
    {
      key: "copyPath",
      label: t("menu.copyPath"),
      onSelect: () => void navigator.clipboard?.writeText(repo.path),
    },
  ];
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
