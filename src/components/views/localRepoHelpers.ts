import type { Translate } from "../../i18n/I18nProvider";
import type { LocalRepo } from "../../types/github";

/** Short status badge label for the enrichment-status pickaxe. */
export function statusLabelKey(status: LocalRepo["enrichmentStatus"]) {
  switch (status) {
    case "enriched":
      return "local.statusEnriched";
    case "unreachable":
      return "local.statusUnreachable";
    case "no-remote":
      return "local.statusNoRemote";
    default:
      return "local.statusLocalOnly";
  }
}

/** Longer hover explainer for the enrichment-status pickaxe badge. */
export function statusTitleKey(status: LocalRepo["enrichmentStatus"]) {
  switch (status) {
    case "enriched":
      return "local.statusEnrichedTitle";
    case "unreachable":
      return "local.statusUnreachableTitle";
    case "no-remote":
      return "local.statusNoRemoteTitle";
    default:
      return "local.statusLocalOnlyTitle";
  }
}

/** Worktree tooltip: a count header, then one line per worktree (branch + dirty marker). */
export function worktreeTooltip(worktrees: LocalRepo[], t: Translate): string {
  if (worktrees.length === 0) return "";
  return [
    t("local.worktreeCount", { count: String(worktrees.length) }),
    ...worktrees.map((w) => `• ${w.branch ?? "(detached)"}${w.dirty ? " *" : ""}`),
  ].join("\n");
}
