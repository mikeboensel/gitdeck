import { type Dispatch, type SetStateAction, useEffect } from "react";

/** Toggle the command palette on ⌘K / Ctrl-K. */
export function useCommandPaletteHotkey(setPaletteOpen: Dispatch<SetStateAction<boolean>>) {
  useEffect(() => {
    function handler(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setPaletteOpen]);
}
