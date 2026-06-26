import { createContext, type ReactNode, useCallback, useContext, useState } from "react";
import { ChangesViewerModal } from "../components/diff/ChangesViewerModal";
import type { LocalRepo } from "../types/github";

interface ChangesViewerContextValue {
  /** Open the uncommitted-changes viewer for a local repo. */
  openChanges: (repo: LocalRepo) => void;
}

const ChangesViewerContext = createContext<ChangesViewerContextValue | null>(null);

/**
 * App-level host for the per-repo working-tree changes viewer. Renders a single
 * shared {@link ChangesViewerModal}; any component calls
 * `useChangesViewer().openChanges(repo)` (e.g. from the right-click menu) without
 * threading modal state through props — mirrors {@link StashViewerProvider}.
 */
export function ChangesViewerProvider({ children }: { children: ReactNode }) {
  const [repo, setRepo] = useState<LocalRepo | null>(null);
  const openChanges = useCallback((next: LocalRepo) => setRepo(next), []);
  const close = useCallback(() => setRepo(null), []);

  return (
    <ChangesViewerContext.Provider value={{ openChanges }}>
      {children}
      {repo ? <ChangesViewerModal repo={repo} onClose={close} /> : null}
    </ChangesViewerContext.Provider>
  );
}

export function useChangesViewer(): ChangesViewerContextValue {
  const value = useContext(ChangesViewerContext);
  if (!value) throw new Error("useChangesViewer must be used inside ChangesViewerProvider");
  return value;
}
