import { createContext, type ReactNode, useCallback, useContext, useState } from "react";
import { CommitHistoryModal } from "../components/CommitHistoryModal";
import type { LocalRepo } from "../types/github";

interface CommitHistoryContextValue {
  /** Open the commit-history graph for a local repo. */
  openHistory: (repo: LocalRepo) => void;
}

const CommitHistoryContext = createContext<CommitHistoryContextValue | null>(null);

/**
 * App-level host for the per-repo commit-history explorer. Renders a single shared
 * {@link CommitHistoryModal}; any component calls `useCommitHistory().openHistory(repo)`
 * (e.g. from the local-repo right-click menu) without threading modal state through
 * props — mirrors {@link CloneRepoProvider}.
 */
export function CommitHistoryProvider({ children }: { children: ReactNode }) {
  const [repo, setRepo] = useState<LocalRepo | null>(null);
  const openHistory = useCallback((next: LocalRepo) => setRepo(next), []);
  const close = useCallback(() => setRepo(null), []);

  return (
    <CommitHistoryContext.Provider value={{ openHistory }}>
      {children}
      {repo ? <CommitHistoryModal repo={repo} onClose={close} /> : null}
    </CommitHistoryContext.Provider>
  );
}

export function useCommitHistory(): CommitHistoryContextValue {
  const value = useContext(CommitHistoryContext);
  if (!value) throw new Error("useCommitHistory must be used inside CommitHistoryProvider");
  return value;
}
