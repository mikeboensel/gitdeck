import { createContext, type ReactNode, useCallback, useContext, useState } from "react";
import { StashViewerModal } from "../components/diff/StashViewerModal";
import type { LocalRepo } from "../types/github";

interface StashViewerContextValue {
  /** Open the stash viewer for a local repo. */
  openStashes: (repo: LocalRepo) => void;
}

const StashViewerContext = createContext<StashViewerContextValue | null>(null);

/**
 * App-level host for the per-repo stash viewer. Renders a single shared
 * {@link StashViewerModal}; any component calls `useStashViewer().openStashes(repo)`
 * (e.g. from the stash pill or the right-click menu) without threading modal state
 * through props — mirrors {@link CommitHistoryProvider}.
 */
export function StashViewerProvider({ children }: { children: ReactNode }) {
  const [repo, setRepo] = useState<LocalRepo | null>(null);
  const openStashes = useCallback((next: LocalRepo) => setRepo(next), []);
  const close = useCallback(() => setRepo(null), []);

  return (
    <StashViewerContext.Provider value={{ openStashes }}>
      {children}
      {repo ? <StashViewerModal repo={repo} onClose={close} /> : null}
    </StashViewerContext.Provider>
  );
}

export function useStashViewer(): StashViewerContextValue {
  const value = useContext(StashViewerContext);
  if (!value) throw new Error("useStashViewer must be used inside StashViewerProvider");
  return value;
}
