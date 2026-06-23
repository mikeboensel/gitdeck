import { errorMessage } from "../utils/errors";
import { getActive as getActiveAccount } from "./accountStore";
import { getReposCached } from "./dashboardData";
import { AuthRequiredError, restApiPaginate } from "./githubClient";
import { logger } from "./logger";

/**
 * Maps each repository (nameWithOwner) the user owns/administers to the logins
 * of its collaborators. Listing collaborators requires admin/push access, so
 * repos the user can only read (403/404) are silently skipped.
 */
export type CollaboratorsResult =
  | { ok: true; byRepo: Record<string, string[]>; fetchedAt: string }
  | { ok: false; error: string; needsAuth?: true };

interface RawCollaborator {
  login: string;
}

const CONCURRENCY = 6;
// Collaborator membership changes rarely and is expensive to fetch (one paginated
// REST call per repo), so cache aggressively — 24h, refreshed only on fresh=1.
const TTL_MS = 24 * 60 * 60 * 1000;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function run(): Promise<void> {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx]!);
    }
  }
  const runners = Array.from({ length: Math.min(limit, items.length) }, run);
  await Promise.all(runners);
  return results;
}

async function fetchRepoCollaborators(
  nameWithOwner: string,
  self: string | null,
): Promise<string[] | "auth-required"> {
  const path = `/repos/${nameWithOwner}/collaborators?per_page=100&affiliation=all`;
  const result = await restApiPaginate<RawCollaborator>(path);
  if (!result.ok) {
    if (result.status === 401) return "auth-required";
    // 403 (no admin/push) / 404 (gone) → we simply can't list collaborators here.
    return [];
  }
  const selfLower = self?.toLowerCase() ?? null;
  return result.data
    .map((entry) => entry.login)
    .filter((login): login is string => Boolean(login) && login.toLowerCase() !== selfLower);
}

let cache: { value: CollaboratorsResult; expiresAt: number } | null = null;
let inflight: Promise<CollaboratorsResult> | null = null;

async function build(): Promise<CollaboratorsResult> {
  const reposResult = await getReposCached(false);
  if (!reposResult.ok) {
    return reposResult.needsAuth
      ? { ok: false, error: "authentication required", needsAuth: true }
      : { ok: false, error: reposResult.error };
  }
  const self = (await getActiveAccount())?.login ?? null;
  const candidates = reposResult.repos.filter((repo) => !repo.isArchived);
  try {
    let authRequired = false;
    const byRepo: Record<string, string[]> = {};
    await mapWithConcurrency(candidates, CONCURRENCY, async (repo) => {
      const logins = await fetchRepoCollaborators(repo.nameWithOwner, self);
      if (logins === "auth-required") {
        authRequired = true;
        return;
      }
      if (logins.length) byRepo[repo.nameWithOwner] = logins;
    });
    if (authRequired) return { ok: false, error: "authentication required", needsAuth: true };
    return { ok: true, byRepo, fetchedAt: new Date().toISOString() };
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return { ok: false, error: "authentication required", needsAuth: true };
    }
    logger.error({ err: error }, "collaborators fetch failed");
    return { ok: false, error: errorMessage(error) };
  }
}

export function getCollaboratorsCached(forceFresh: boolean): Promise<CollaboratorsResult> {
  if (!forceFresh && cache && cache.expiresAt > Date.now()) return Promise.resolve(cache.value);
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const value = await build();
      if (value.ok) cache = { value, expiresAt: Date.now() + TTL_MS };
      return value;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function invalidateCollaboratorsCache(): void {
  cache = null;
}
