import type { GhIssue, GhRepo, RepoInsight } from "../../types/github";
import { RepoGrid } from "./RepoGrid";
import { RepoList } from "./RepoList";

// "disk" is Local-tab-only (a disk-usage chart); the Repositories tab offers
// just grid/list via REPO_LAYOUT_OPTIONS.
export type RepoLayout = "grid" | "list" | "disk";
export type RepoDensity = "compact" | "cozy" | "comfortable";

export const REPO_LAYOUT_OPTIONS: RepoLayout[] = ["grid", "list"];
export const REPO_DENSITY_OPTIONS: RepoDensity[] = ["compact", "cozy", "comfortable"];

/** Data + handlers shared by both repo layouts, so they're drop-in interchangeable. */
export interface RepoViewDataProps {
  repos: GhRepo[];
  issues: GhIssue[];
  insightsByRepo: Map<string, RepoInsight>;
  /** Lowercased nameWithOwner → local clone paths on disk. */
  localClonesByRepo: Map<string, string[]>;
  onRepoClick: (repo: GhRepo) => void;
  onIssuesClick: (repo: string) => void;
  onStarsClick: (repo: string) => void;
  onForksClick: (repo: string) => void;
  onLocalClick: (repo: string) => void;
}

interface ReposViewProps extends RepoViewDataProps {
  layout: RepoLayout;
  density: RepoDensity;
}

/**
 * Single dispatch point for the Repos tab. Holds the only `layout` branch in the
 * feature and applies `density` once via a data attribute consumed by CSS variables
 * — so neither RepoGrid nor RepoList contains layout/density conditionals.
 */
export function ReposView({ layout, density, ...data }: ReposViewProps) {
  return (
    <div className="repos-view" data-layout={layout} data-density={density}>
      {layout === "list" ? <RepoList {...data} /> : <RepoGrid {...data} />}
    </div>
  );
}
