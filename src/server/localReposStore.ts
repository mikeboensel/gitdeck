import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import type { LocalReposConfig } from "../types/github";
import { DATA_DIR, LOCAL_REPOS_CONFIG_PATH } from "./config";
import { logger } from "./logger";

/**
 * Persists the local-repo scan configuration (roots, extra excludes, triage
 * denylist) at ~/.gitdeck/local-repos.json. Mirrors the aliasStore pattern:
 * in-memory cache + promise dedup + graceful ENOENT + mkdir-on-save.
 */

const EMPTY: LocalReposConfig = { scanRoots: [], excludes: [], denylist: [] };

let cache: LocalReposConfig | null = null;
let loadPromise: Promise<LocalReposConfig> | null = null;

function normalize(raw: Partial<LocalReposConfig> | null): LocalReposConfig {
  return {
    scanRoots: Array.isArray(raw?.scanRoots)
      ? raw.scanRoots.filter((s) => typeof s === "string")
      : [],
    excludes: Array.isArray(raw?.excludes) ? raw.excludes.filter((s) => typeof s === "string") : [],
    denylist: Array.isArray(raw?.denylist) ? raw.denylist.filter((s) => typeof s === "string") : [],
  };
}

async function load(): Promise<LocalReposConfig> {
  if (cache) return cache;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const raw = await readFile(LOCAL_REPOS_CONFIG_PATH, "utf-8");
      cache = normalize(JSON.parse(raw) as Partial<LocalReposConfig>);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        logger.warn({ err }, "local-repos config unreadable/corrupt — starting empty");
      }
      cache = { ...EMPTY };
    }
    return cache;
  })();
  return loadPromise;
}

async function save(): Promise<void> {
  if (!cache) return;
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(LOCAL_REPOS_CONFIG_PATH, JSON.stringify(cache, null, 2));
}

/** Effective scan roots — falls back to the home directory when none configured. */
export async function getScanRoots(): Promise<string[]> {
  const config = await load();
  return config.scanRoots.length ? [...config.scanRoots] : [homedir()];
}

export async function getConfig(): Promise<LocalReposConfig> {
  const config = await load();
  return {
    ...config,
    scanRoots: [...config.scanRoots],
    excludes: [...config.excludes],
    denylist: [...config.denylist],
  };
}

/** Replace any provided fields; absent fields are left unchanged. */
export async function updateConfig(updates: Partial<LocalReposConfig>): Promise<LocalReposConfig> {
  const current = await load();
  cache = normalize({ ...current, ...updates });
  await save();
  return getConfig();
}

export function resetLocalReposConfigCache(): void {
  cache = null;
  loadPromise = null;
}
