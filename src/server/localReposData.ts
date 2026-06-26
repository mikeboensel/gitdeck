import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { LocalRepo } from "../types/github";
import { errorMessage } from "../utils/errors";
import { list as listAccounts } from "./accountStore";
import { LOCAL_REPOS_CACHE_PATH } from "./config";
import { getCachedSizes } from "./localRepoSizes";
import { getConfig, getScanRoots } from "./localReposStore";
import { mapPool, type ScannedRepo, scanLocalRepos } from "./localScan";
import { logger } from "./logger";
import { getProviderForAccount } from "./providers/registry";
import type { Account, Provider } from "./providers/types";

// Inline literal (not the LocalReposOk interface) so the union carries an
// implicit string index signature and is assignable to the Envelope type
// cacheableJson expects — mirrors dashboardData's ReposResult.
type LocalReposOk = { ok: true; repos: LocalRepo[]; scannedAt: string };
export type LocalReposResult = LocalReposOk | { ok: false; error: string };

// A whole-drive scan is expensive, so this is a long backstop — NOT a freshness
// SLA. Freshness is driven by the explicit Rescan button (fresh=1) and by config
// changes (which call invalidateLocalReposCache). The TTL only exists so a very
// stale cache eventually self-heals on its own; casual tab revisits never rescan.
const TTL_MS = 24 * 60 * 60 * 1000;
const ENRICH_CONCURRENCY = 6;
const ENRICHABLE_HOSTS = new Set(["github.com", "www.github.com"]);

let memory: { value: LocalReposOk; expiresAt: number } | null = null;
let inflight: Promise<LocalReposResult> | null = null;

/** Find a GitHub account to enrich with — prefer the active one, else any. */
async function githubEnricher(): Promise<{ account: Account; provider: Provider } | null> {
  const accounts = await listAccounts();
  const github = accounts.filter((a) => a.providerKind === "github");
  if (!github.length) return null;
  const account = github[0];
  if (!account) return null;
  const provider = await getProviderForAccount(account);
  if (typeof provider.fetchRepoByName !== "function") return null;
  return { account, provider };
}

function toLocalRepo(
  scanned: ScannedRepo,
  enrichment: LocalRepo["enrichment"],
  status: LocalRepo["enrichmentStatus"],
): LocalRepo {
  return { ...scanned, enrichment, enrichmentStatus: status };
}

async function buildLocalRepos(): Promise<LocalRepo[]> {
  const config = await getConfig();
  const roots = await getScanRoots();
  const scanned = await scanLocalRepos({
    roots,
    excludes: config.excludes,
    denylist: config.denylist,
  });

  const enricher = await githubEnricher();

  const result = await mapPool(scanned, ENRICH_CONCURRENCY, async (repo): Promise<LocalRepo> => {
    if (!repo.nameWithOwner || !repo.host) return toLocalRepo(repo, null, "no-remote");
    const enrichable = ENRICHABLE_HOSTS.has(repo.host.toLowerCase());
    if (!enrichable || !enricher) return toLocalRepo(repo, null, "local-only");

    const [owner, name] = repo.nameWithOwner.split("/");
    if (!owner || !name) return toLocalRepo(repo, null, "local-only");
    try {
      const gh = await enricher.provider.fetchRepoByName?.(enricher.account, owner, name);
      return gh ? toLocalRepo(repo, gh, "enriched") : toLocalRepo(repo, null, "unreachable");
    } catch (err) {
      logger.warn({ err, repo: repo.nameWithOwner }, "local repo enrichment failed");
      return toLocalRepo(repo, null, "unreachable");
    }
  });

  // Attach last-known disk sizes from the TTL-gated cache (no `du` here — that's
  // measured separately via /api/local-repos/sizes). Badges render instantly with
  // whatever's cached; a refresh fills in missing/stale sizes afterwards.
  const sizes = await getCachedSizes(result.map((r) => r.path));
  for (const repo of result) repo.sizeBytes = sizes.get(repo.path) ?? null;

  // Stable order: most recently committed first, then by path.
  result.sort((a, b) => {
    const da = a.lastCommit?.date ?? "";
    const db = b.lastCommit?.date ?? "";
    if (da !== db) return db.localeCompare(da);
    return a.path.localeCompare(b.path);
  });
  return result;
}

async function persist(data: LocalReposOk): Promise<void> {
  try {
    await mkdir(dirname(LOCAL_REPOS_CACHE_PATH), { recursive: true });
    await writeFile(LOCAL_REPOS_CACHE_PATH, JSON.stringify(data));
  } catch (err) {
    logger.warn({ err }, "local repos cache persist failed (best-effort)");
  }
}

async function loadFromDisk(): Promise<LocalReposOk | null> {
  try {
    const raw = await readFile(LOCAL_REPOS_CACHE_PATH, "utf-8");
    const data = JSON.parse(raw) as LocalReposOk;
    if (data?.ok && Array.isArray(data.repos)) {
      // Discard caches written before the granular `changes` field existed;
      // serving them would crash the frontend's per-category pill render.
      if (data.repos.length > 0 && !data.repos[0]?.changes) return null;
      // Discard caches predating `sizeBytes` (absent key, not a null value) so a
      // rescan repopulates disk sizes. `null` is a valid measured-but-unknown.
      if (data.repos.length > 0 && data.repos[0] && !("sizeBytes" in data.repos[0])) return null;
      // Discard caches predating authoritative `linkedWorktrees` enumeration.
      if (data.repos.length > 0 && data.repos[0] && !("linkedWorktrees" in data.repos[0])) {
        return null;
      }
      // Discard caches predating `stashCount` so a rescan populates stash data.
      if (data.repos.length > 0 && data.repos[0] && !("stashCount" in data.repos[0])) {
        return null;
      }
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Return scanned + enriched local repos. A whole-drive scan is expensive, so:
 * non-`fresh` calls serve the in-memory cache, then the on-disk cache, before
 * scanning. `fresh` always rescans. Concurrent calls share one in-flight scan.
 */
export async function getLocalReposCached(fresh: boolean): Promise<LocalReposResult> {
  if (!fresh && memory && memory.expiresAt > Date.now()) return memory.value;
  if (!fresh) {
    const disk = await loadFromDisk();
    if (disk) {
      memory = { value: disk, expiresAt: Date.now() + TTL_MS };
      return disk;
    }
  }
  if (inflight) return inflight;

  inflight = (async (): Promise<LocalReposResult> => {
    try {
      const repos = await buildLocalRepos();
      const value: LocalReposOk = { ok: true, repos, scannedAt: new Date().toISOString() };
      memory = { value, expiresAt: Date.now() + TTL_MS };
      await persist(value);
      return value;
    } catch (error) {
      logger.error({ err: error }, "local repos scan failed");
      return { ok: false, error: errorMessage(error) };
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function invalidateLocalReposCache(): void {
  memory = null;
}
