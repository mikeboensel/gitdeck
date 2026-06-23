/**
 * Persists the repo→collaborators map to localStorage so the Collaborators
 * facet renders instantly on the next page load without any network call.
 * Collaborator data is expensive to fetch (one API call per repo), so we cache
 * it aggressively and only refetch on an explicit refresh. Mirrors statsCache.ts.
 */

const STORAGE_KEY = "gh-dash.cache.collaborators";

export interface CachedCollaborators {
  byRepo: Record<string, string[]>;
  fetchedAt: string;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Read cached collaborators. Returns null if absent or unparseable. */
export function readCollaboratorsCache(): CachedCollaborators | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const candidate = parsed as Record<string, unknown>;
    if (typeof candidate.fetchedAt !== "string") return null;
    if (!candidate.byRepo || typeof candidate.byRepo !== "object") return null;
    if (!Object.values(candidate.byRepo as Record<string, unknown>).every(isStringArray)) {
      return null;
    }
    return parsed as CachedCollaborators;
  } catch {
    return null;
  }
}

/** Write collaborators to localStorage. Silently fails on quota errors. */
export function writeCollaboratorsCache(data: CachedCollaborators): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Quota exceeded or private browsing — ignore silently
  }
}

/** Remove cached collaborators (e.g. on logout or account switch). */
export function clearCollaboratorsCache(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}
