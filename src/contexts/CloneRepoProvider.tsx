import { createContext, type ReactNode, useCallback, useContext, useState } from "react";
import { CloneRepoModal } from "../components/modals/CloneRepoModal";
import type { GhRepo } from "../types/github";

interface CloneRepoContextValue {
  /** Open the clone-destination picker for a repository. */
  openClone: (repo: GhRepo) => void;
}

const CloneRepoContext = createContext<CloneRepoContextValue | null>(null);

/**
 * App-level host for the "Clone repository" flow. Renders a single shared
 * {@link CloneRepoModal}; any component calls `useCloneRepo().openClone(repo)`
 * (e.g. from the right-click menu) without threading modal state through props.
 */
export function CloneRepoProvider({ children }: { children: ReactNode }) {
  const [repo, setRepo] = useState<GhRepo | null>(null);
  const openClone = useCallback((next: GhRepo) => setRepo(next), []);
  const close = useCallback(() => setRepo(null), []);

  return (
    <CloneRepoContext.Provider value={{ openClone }}>
      {children}
      {repo ? <CloneRepoModal repo={repo} onClose={close} /> : null}
    </CloneRepoContext.Provider>
  );
}

export function useCloneRepo(): CloneRepoContextValue {
  const value = useContext(CloneRepoContext);
  if (!value) throw new Error("useCloneRepo must be used inside CloneRepoProvider");
  return value;
}
