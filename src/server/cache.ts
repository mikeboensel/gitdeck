/**
 * Shared in-memory caching primitives for server data modules.
 *
 * Every data module (dashboardData, collaborators, ciHealth, repoInsights,
 * securityAlerts, …) previously hand-rolled the same TTL + in-flight-dedup
 * pattern with slightly different variable names. These two primitives
 * consolidate that so the policy lives in one tested place.
 *
 * - `memoize`      — a single cached value behind one fetcher.
 * - `memoizeByKey` — a per-key cache + per-key in-flight dedup (Map-backed).
 *
 * Modules with extra tiers or cached-entry mutation (notifications'
 * If-Modified-Since + mark-read, localReposData's disk tier) intentionally do
 * NOT use these — their needs go beyond a plain memoize.
 */

export interface Memoized<T> {
  /** Return the cached value when fresh, else fetch (deduping concurrent callers). */
  get(forceFresh: boolean): Promise<T>;
  /** Return the cached value only if still fresh, without ever fetching. */
  peek(): T | null;
  /** Drop the cached value; the next `get` refetches. */
  invalidate(): void;
}

export interface MemoizeOptions<T> {
  /**
   * Decide whether a freshly-fetched value should be cached. Defaults to
   * caching everything. Modules that only want to cache successes pass
   * `(v) => v.ok` so failures aren't sticky.
   */
  shouldCache?: (value: T) => boolean;
}

/**
 * Memoize a single async value for `ttlMs`, deduping concurrent `get` calls
 * onto one in-flight promise. The `forceFresh` flag passed to `get` is
 * forwarded to `fetcher` so callers can propagate a refresh to upstream caches.
 */
export function memoize<T>(
  ttlMs: number,
  fetcher: (forceFresh: boolean) => Promise<T>,
  opts: MemoizeOptions<T> = {},
): Memoized<T> {
  const shouldCache = opts.shouldCache ?? (() => true);
  let cache: { value: T; expiresAt: number } | null = null;
  let inflight: Promise<T> | null = null;
  return {
    async get(forceFresh: boolean): Promise<T> {
      if (!forceFresh && cache && cache.expiresAt > Date.now()) return cache.value;
      if (inflight) return inflight;
      inflight = (async () => {
        try {
          const value = await fetcher(forceFresh);
          if (shouldCache(value)) cache = { value, expiresAt: Date.now() + ttlMs };
          return value;
        } finally {
          inflight = null;
        }
      })();
      return inflight;
    },
    peek() {
      return cache && cache.expiresAt > Date.now() ? cache.value : null;
    },
    invalidate() {
      cache = null;
    },
  };
}

export interface MemoizedByKey<T> {
  /** Cached value for `key` when fresh, else load it (deduping per key). */
  get(key: string, forceFresh?: boolean): Promise<T>;
  /** Drop one key's cache, or all keys when called without an argument. */
  invalidate(key?: string): void;
}

/**
 * Per-key variant of {@link memoize}: each key gets its own TTL entry and its
 * own in-flight promise, so concurrent loads of the same key are deduped while
 * different keys load independently.
 */
export function memoizeByKey<T>(
  ttlMs: number,
  loader: (key: string) => Promise<T>,
  opts: MemoizeOptions<T> = {},
): MemoizedByKey<T> {
  const shouldCache = opts.shouldCache ?? (() => true);
  const cache = new Map<string, { value: T; expiresAt: number }>();
  const inflight = new Map<string, Promise<T>>();
  return {
    async get(key: string, forceFresh = false): Promise<T> {
      if (!forceFresh) {
        const hit = cache.get(key);
        if (hit && hit.expiresAt > Date.now()) return hit.value;
      }
      const pending = inflight.get(key);
      if (pending) return pending;
      const promise = (async () => {
        try {
          const value = await loader(key);
          if (shouldCache(value)) cache.set(key, { value, expiresAt: Date.now() + ttlMs });
          return value;
        } finally {
          inflight.delete(key);
        }
      })();
      inflight.set(key, promise);
      return promise;
    },
    invalidate(key?: string) {
      if (key === undefined) cache.clear();
      else cache.delete(key);
    },
  };
}
