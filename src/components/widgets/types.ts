import type { ComponentType } from "react";
import type { GhRepo, RepoInsight } from "../../types/github";

/**
 * Shared data the host hands to every widget. Keep this small and stable: widgets
 * read what they need and ignore the rest, so adding a field never breaks one.
 */
export interface WidgetContext {
  /** Repo insights already filtered to the user's active repo filters. */
  insights: RepoInsight[];
  /** Lookup from `insight.repo` to the full repo record. */
  reposByName: Map<string, GhRepo>;
  /** Open the repository detail modal (e.g. on row click). */
  onRepoClick: (repo: GhRepo) => void;
}

/**
 * A self-contained visualization. Everything a widget needs lives in its own
 * folder under `widgets/`; the manifest is the only thing the registry imports.
 */
export interface WidgetManifest {
  /** Stable id — used as the localStorage visibility key. Never reuse across widgets. */
  id: string;
  /** Title shown in the card header and the show/hide toggle. */
  title: string;
  /** One-line description shown under the title. */
  description: string;
  /** Whether the widget renders before the user has toggled anything. */
  enabledByDefault: boolean;
  /** The widget body. Receives the shared context and owns its own data shaping. */
  component: ComponentType<{ ctx: WidgetContext }>;
}
