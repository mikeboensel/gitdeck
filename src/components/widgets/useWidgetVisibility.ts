import { useCallback, useState } from "react";

const STORAGE_KEY = "gitdeck.widgets.hidden";

/**
 * Per-user show/hide state for widgets, persisted to localStorage and keyed by
 * widget id. Seeded from each widget's `enabledByDefault` on first load; after
 * that the stored set governs. A removed widget's id lingering here is harmless.
 */
export function useWidgetVisibility(defaultHidden: string[]) {
  const [hidden, setHidden] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set(defaultHidden);
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === null) return new Set(defaultHidden);
    try {
      return new Set(JSON.parse(stored) as string[]);
    } catch {
      return new Set(defaultHidden);
    }
  });

  const toggle = useCallback((id: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // Storage may be unavailable (private mode / quota) — visibility just
        // won't persist across reloads, which is acceptable for an audition UI.
      }
      return next;
    });
  }, []);

  return { hidden, toggle };
}
