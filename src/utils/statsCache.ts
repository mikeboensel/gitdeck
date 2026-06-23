/**
 * Persists dashboard API responses to localStorage so that subsequent page
 * loads can display last-known values immediately (avoiding a flash of zeros).
 */

const STORAGE_PREFIX = "gh-dash.cache.";

// Arrays typed as unknown[] to avoid coupling this module to the full GitHub types.
// The consumer casts them back (e.g. `as GhRepo[]`) — the cache is just a pass-through.
export interface CachedStats {
  repos: unknown[];
  owners: string[];
  issues: unknown[];
  pullRequests: unknown[];
  fetchedAt: string;
  savedAt: number;
}

const STATS_KEY = `${STORAGE_PREFIX}stats`;

/**
 * Read cached stats from localStorage.
 * Returns null if no cache exists or if the data is unparseable.
 */
export function readStatsCache(): CachedStats | null {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    const candidate = parsed as Record<string, unknown>;
    if (
      !Array.isArray(candidate.repos) ||
      !Array.isArray(candidate.issues) ||
      !Array.isArray(candidate.pullRequests) ||
      !Array.isArray(candidate.owners) ||
      typeof candidate.fetchedAt !== "string" ||
      typeof candidate.savedAt !== "number"
    ) {
      return null;
    }
    return parsed as CachedStats;
  } catch {
    return null;
  }
}

/**
 * Write stats to localStorage. Silently fails on quota errors.
 */
export function writeStatsCache(data: Omit<CachedStats, "savedAt">): void {
  try {
    const entry: CachedStats = { ...data, savedAt: Date.now() };
    localStorage.setItem(STATS_KEY, JSON.stringify(entry));
  } catch {
    // Quota exceeded or private browsing — ignore silently
  }
}

/**
 * Remove cached stats (e.g. on logout or account switch).
 */
export function clearStatsCache(): void {
  try {
    localStorage.removeItem(STATS_KEY);
  } catch {
    // Ignore
  }
}
