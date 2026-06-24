import type { CommitActivityDay } from "../types/github";
import { errorMessage } from "../utils/errors";
import { getActive as getActiveAccount } from "./accountStore";
import { memoize } from "./cache";
import { logger } from "./logger";
import { getProviderForAccount } from "./providers/registry";

export type CommitActivityResult =
  | { ok: true; days: CommitActivityDay[]; repos: string[]; generatedAt: string }
  | { ok: false; error: string; needsAuth?: true };

// Commit history changes slowly and the underlying GraphQL is several calls, so
// cache for an hour. `fresh=1` still forces a refetch.
const TTL_MS = 60 * 60 * 1000;
const WINDOW_DAYS = 365;

/** Auth failures arrive as either AuthRequiredError or GitHubAuthRequiredError
 *  (distinct classes); match by name/message rather than a single instanceof. */
function isAuthLike(error: unknown): boolean {
  return (
    error instanceof Error &&
    (/AuthRequired/.test(error.name) || /authentication required/i.test(error.message))
  );
}

async function build(): Promise<CommitActivityResult> {
  const account = await getActiveAccount();
  if (!account) return { ok: false, error: "authentication required", needsAuth: true };
  const provider = await getProviderForAccount(account);

  const to = new Date();
  const from = new Date(to.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  try {
    const days = await provider.listCommitActivity(account, from.toISOString(), to.toISOString());
    // Rank repos by total commits (desc) so the legend/stack order is stable.
    const totals = new Map<string, number>();
    for (const day of days) totals.set(day.repo, (totals.get(day.repo) ?? 0) + day.count);
    const repos = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([repo]) => repo);
    return { ok: true, days, repos, generatedAt: new Date().toISOString() };
  } catch (error) {
    if (isAuthLike(error)) return { ok: false, error: "authentication required", needsAuth: true };
    logger.error({ err: error }, "commit activity fetch failed");
    return { ok: false, error: errorMessage(error) };
  }
}

const store = memoize<CommitActivityResult>(TTL_MS, build, { shouldCache: (v) => v.ok });

export function getCommitActivityCached(forceFresh: boolean): Promise<CommitActivityResult> {
  return store.get(forceFresh);
}

export function invalidateCommitActivityCache(): void {
  store.invalidate();
}
