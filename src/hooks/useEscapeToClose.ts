import { useEffect } from "react";
import type { NavigateFunction } from "react-router-dom";
import { TAB_ROUTES, type Tab } from "../appHelpers";

interface EscapeToCloseOptions {
  paletteOpen: boolean;
  /** Truthy when a searchParams-driven repo modal (detail or metric) is open. */
  routeRepoName: string;
  changelogOpen: boolean;
  contributorsOpen: boolean;
  welcomeOpen: boolean;
  filtersOpen: boolean;
  tab: Tab;
  navigate: NavigateFunction;
  setPaletteOpen: (open: boolean) => void;
  setChangelogOpen: (open: boolean) => void;
  setContributorsOpen: (open: boolean) => void;
  setWelcomeOpen: (open: boolean) => void;
  setFiltersOpen: (open: boolean) => void;
}

/**
 * Escape closes the topmost open overlay. Modals can stack (e.g. the command
 * palette opens via ⌘K over a repo modal), so close only the frontmost one in
 * priority order rather than all at once.
 */
export function useEscapeToClose({
  paletteOpen,
  routeRepoName,
  changelogOpen,
  contributorsOpen,
  welcomeOpen,
  filtersOpen,
  tab,
  navigate,
  setPaletteOpen,
  setChangelogOpen,
  setContributorsOpen,
  setWelcomeOpen,
  setFiltersOpen,
}: EscapeToCloseOptions) {
  useEffect(() => {
    function handler(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // routeRepoName covers both the repo-detail and metric modals (searchParams
      // driven); both dismiss by navigating back to the current tab route.
      if (paletteOpen) setPaletteOpen(false);
      else if (routeRepoName) navigate(TAB_ROUTES[tab]);
      else if (changelogOpen) setChangelogOpen(false);
      else if (contributorsOpen) setContributorsOpen(false);
      else if (welcomeOpen) setWelcomeOpen(false);
      else if (filtersOpen) setFiltersOpen(false);
      else return;
      event.preventDefault();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    paletteOpen,
    routeRepoName,
    changelogOpen,
    contributorsOpen,
    welcomeOpen,
    filtersOpen,
    navigate,
    tab,
    setPaletteOpen,
    setChangelogOpen,
    setContributorsOpen,
    setWelcomeOpen,
    setFiltersOpen,
  ]);
}
