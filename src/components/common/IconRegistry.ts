import type { IconType } from "react-icons";
import {
  LuArchive,
  LuCircleDot,
  LuCopy,
  LuDownload,
  LuExternalLink,
  LuFileDiff,
  LuFolderOpen,
  LuHistory,
  LuInfo,
  LuLink,
  LuSquareCode,
  LuSquareTerminal,
} from "react-icons/lu";

/**
 * Single source of truth mapping UI *concepts* (not specific call sites) to a
 * lucide icon. Keying by concept rather than by menu item keeps the same idea —
 * "view stashes", "copy a path" — visually consistent everywhere it appears
 * (context menus, pills, buttons). Add a new concept here before reaching for an
 * icon inline, and reuse an existing one when the meaning matches.
 *
 * Consistency rule: same concept → same icon, app-wide. The card's stash pill
 * (`GitStatusPills`) and the "View stashes" menu item both resolve `stash`.
 */
export const ICONS = {
  /** Uncommitted working-tree changes / diff view. */
  changes: LuFileDiff,
  /** Commit history / past activity. */
  history: LuHistory,
  /** Stashed (shelved) changes — matches the card's stash pill. */
  stash: LuArchive,
  /** Reveal a folder in the OS file manager (Finder). */
  revealFinder: LuFolderOpen,
  /** Open in an external code editor. */
  openEditor: LuSquareCode,
  /** Open a terminal at a location. */
  openTerminal: LuSquareTerminal,
  /** Open a target in an external app / new tab (e.g. on GitHub). */
  openExternal: LuExternalLink,
  /** Open an in-app details panel / modal. */
  details: LuInfo,
  /** Issues (GitHub issue glyph). */
  issues: LuCircleDot,
  /** Clone a repository to disk. */
  clone: LuDownload,
  /** Copy text (name, path, …) to the clipboard. */
  copy: LuCopy,
  /** Copy a URL/link to the clipboard. */
  copyLink: LuLink,
} as const satisfies Record<string, IconType>;

/** A valid concept key for {@link ICONS}. */
export type IconConcept = keyof typeof ICONS;
