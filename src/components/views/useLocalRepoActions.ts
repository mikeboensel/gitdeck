import { type MouseEvent as ReactMouseEvent, useEffect, useState } from "react";
import { openLocalRepo } from "../../api/github";
import { useCommitHistory } from "../../contexts/CommitHistoryProvider";
import { useRightClickMenu } from "../../contexts/RightClickMenuProvider";
import { useStashViewer } from "../../contexts/StashViewerProvider";
import { useI18n } from "../../i18n/I18nProvider";
import { buildLocalRepoMenu } from "../../menus/localRepoMenu";
import type { LocalRepo } from "../../types/github";
import { errorMessage } from "../../utils/errors";

/**
 * Shared "open natively / right-click menu" wiring for the card and row variants:
 * a transient open-error message plus the context-menu handler. Keeps both
 * variants in sync without duplicating the Finder/Cursor plumbing.
 */
export function useLocalRepoActions(repo: LocalRepo): {
  actionError: string;
  onContextMenu: (event: ReactMouseEvent) => void;
  onViewHistory: () => void;
} {
  const { t } = useI18n();
  const { open } = useRightClickMenu();
  const { openHistory } = useCommitHistory();
  const { openStashes } = useStashViewer();
  // Transient feedback when a native "open" (Finder/Cursor) fails, e.g. Cursor
  // isn't installed. Clears itself a few seconds after it's shown.
  const [actionError, setActionError] = useState("");
  useEffect(() => {
    if (!actionError) return;
    const id = setTimeout(() => setActionError(""), 4000);
    return () => clearTimeout(id);
  }, [actionError]);

  const runOpen = (target: "finder" | "cursor" | "terminal") => {
    setActionError("");
    openLocalRepo(repo.path, target).catch((err: unknown) => {
      setActionError(`${t("local.openFailed")}: ${errorMessage(err)}`);
    });
  };

  const onContextMenu = (event: ReactMouseEvent) =>
    open(event, {
      ariaLabel: repo.name,
      items: buildLocalRepoMenu(
        repo,
        {
          onReveal: () => runOpen("finder"),
          onOpenInCursor: () => runOpen("cursor"),
          onOpenInTerminal: () => runOpen("terminal"),
          onViewHistory: () => openHistory(repo),
          onViewStashes: () => openStashes(repo),
        },
        t,
      ),
    });

  return { actionError, onContextMenu, onViewHistory: () => openHistory(repo) };
}
