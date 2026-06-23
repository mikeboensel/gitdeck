import type { GhRepo } from "../../../types/github";

/** Shared page size for the paginated panels inside the repository details modal. */
export const MODAL_PAGE_SIZE = 10;

export function historyDelta(repo: GhRepo, field: "stars" | "forks") {
  const history = repo.history || [];
  if (history.length < 2) return null;
  return history[history.length - 1]![field] - history[0]![field];
}

export function formatReleaseDate(iso: string | null | undefined) {
  if (!iso) return "Unpublished";
  return new Date(iso).toLocaleDateString();
}
