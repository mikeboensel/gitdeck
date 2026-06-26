import type { InboxItem } from "../../utils/inbox";

export type Density = "compact" | "cozy" | "comfortable";

export const DENSITY_KEY = "gh-dash.inboxDensity";
export const DENSITY_OPTIONS: Density[] = ["compact", "cozy", "comfortable"];

export function readStoredDensity(): Density {
  if (typeof window === "undefined") return "cozy";
  const raw = window.localStorage.getItem(DENSITY_KEY);
  return DENSITY_OPTIONS.includes(raw as Density) ? (raw as Density) : "cozy";
}

export function kindLabel(item: InboxItem): string {
  return item.kind === "pull-request" ? "PR" : "Issue";
}

export function primaryReason(item: InboxItem): string {
  return item.reasons[0]?.label || item.status;
}

export function scoreTone(item: InboxItem): string {
  if (item.score >= 80) return "danger";
  if (item.score >= 60) return "attention";
  if (item.score >= 42) return "warning";
  return "default";
}
