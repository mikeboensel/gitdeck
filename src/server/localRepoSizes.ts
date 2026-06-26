import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { LOCAL_REPO_SIZES_PATH } from "./config";
import { diskSizeBytes, mapPool } from "./localScan";
import { logger } from "./logger";

/**
 * Persistent, TTL-gated cache of on-disk repo sizes (`du` results), keyed by
 * absolute repo path. `du` is a full-tree walk and the dominant cost of a local
 * scan, so it's lifted out of the scan path (localScan no longer measures it) and
 * served from here instead: a repo is only re-measured when its cached size is
 * older than the configured TTL. Mirrors the localReposStore persistence pattern
 * (in-memory cache + lazy disk load + best-effort save).
 */

interface SizeEntry {
  /** Last `du` result in bytes; null when the directory was unmeasurable. */
  sizeBytes: number | null;
  /** Epoch ms when this entry was measured — compared against the TTL. */
  measuredAt: number;
}

/** Bounded `du` concurrency — matches the scan's git pool so a refresh of a large
 * repo set doesn't spawn hundreds of `du` walks at once. */
const SIZE_CONCURRENCY = 8;

/** Measure one path's disk size. Injectable so tests don't shell out to `du`. */
export type SizeMeasurer = (path: string) => Promise<number | null>;

let cache: Map<string, SizeEntry> | null = null;
let loadPromise: Promise<Map<string, SizeEntry>> | null = null;

async function load(): Promise<Map<string, SizeEntry>> {
  if (cache) return cache;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const raw = await readFile(LOCAL_REPO_SIZES_PATH, "utf-8");
      const parsed = JSON.parse(raw) as Record<string, SizeEntry>;
      cache = new Map(
        Object.entries(parsed).filter(
          ([, e]) => e && typeof e.measuredAt === "number" && "sizeBytes" in e,
        ),
      );
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        logger.warn({ err }, "local-repo-sizes cache unreadable/corrupt — starting empty");
      }
      cache = new Map();
    }
    return cache;
  })();
  return loadPromise;
}

async function persist(map: Map<string, SizeEntry>): Promise<void> {
  try {
    await mkdir(dirname(LOCAL_REPO_SIZES_PATH), { recursive: true });
    await writeFile(LOCAL_REPO_SIZES_PATH, JSON.stringify(Object.fromEntries(map)));
  } catch (err) {
    logger.warn({ err }, "local-repo-sizes cache persist failed (best-effort)");
  }
}

/**
 * Return cached sizes for `paths` without measuring anything — used to attach
 * last-known sizes to a fresh scan so list/grid badges render instantly (possibly
 * stale) while a refresh runs separately. Paths with no cached entry map to null.
 */
export async function getCachedSizes(paths: string[]): Promise<Map<string, number | null>> {
  const map = await load();
  const out = new Map<string, number | null>();
  for (const p of paths) out.set(p, map.get(p)?.sizeBytes ?? null);
  return out;
}

/**
 * Return sizes for `paths`, re-measuring only those whose cached entry is missing
 * or older than `ttlMs`. Fresh entries are reused (no `du`). Updates and persists
 * the cache. `now`/`measure` are injectable for tests.
 */
export async function refreshSizes(
  paths: string[],
  ttlMs: number,
  now: number = Date.now(),
  measure: SizeMeasurer = diskSizeBytes,
): Promise<Map<string, number | null>> {
  const map = await load();
  const stale = paths.filter((p) => {
    const entry = map.get(p);
    return !entry || now - entry.measuredAt >= ttlMs;
  });

  if (stale.length > 0) {
    const measured = await mapPool(stale, SIZE_CONCURRENCY, async (path) => ({
      path,
      sizeBytes: await measure(path),
    }));
    for (const { path, sizeBytes } of measured) map.set(path, { sizeBytes, measuredAt: now });
    await persist(map);
    logger.info(
      { measured: stale.length, total: paths.length, ttlMs },
      "local repo sizes refreshed",
    );
  }

  const out = new Map<string, number | null>();
  for (const p of paths) out.set(p, map.get(p)?.sizeBytes ?? null);
  return out;
}

/** Test/maintenance hook: drop the in-memory cache so the next call reloads. */
export function resetLocalRepoSizesCache(): void {
  cache = null;
  loadPromise = null;
}
