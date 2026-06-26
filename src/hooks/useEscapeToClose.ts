import { useEffect } from "react";
import { hasOpenModal } from "../components/common/Modal";

interface EscapeToCloseOptions {
  filtersOpen: boolean;
  setFiltersOpen: (open: boolean) => void;
}

/**
 * Escape closes the filters panel — the one overlay that isn't a {@link Modal}.
 * All modals share a single Escape stack (see `useModalEscape`) that closes the
 * topmost one; this defers to it via {@link hasOpenModal} so a modal stacked
 * over the filters panel closes first.
 */
export function useEscapeToClose({ filtersOpen, setFiltersOpen }: EscapeToCloseOptions) {
  useEffect(() => {
    function handler(event: KeyboardEvent) {
      if (event.key !== "Escape" || !filtersOpen || hasOpenModal()) return;
      setFiltersOpen(false);
      event.preventDefault();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [filtersOpen, setFiltersOpen]);
}
