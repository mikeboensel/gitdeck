import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { subscribeToToasts, type Toast } from "../../utils/toast";

/** How long a toast stays fully visible before it begins its outro. */
const TOAST_TTL_MS = 2600;
/** Outro duration — must match the `toast-out` animation in toast.css. */
const TOAST_EXIT_MS = 320;

/** A queued toast plus its lifecycle flag (`leaving` drives the outro). */
type DisplayToast = Toast & { leaving: boolean };

/** Inline check glyph for the success chip (avoids pulling in an icon dep). */
function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/**
 * Single delegated toast layer, mounted once at the app root next to
 * `TooltipLayer`. Subscribes to the framework-agnostic toast bus
 * (`src/utils/toast`) and renders a bottom-centered, auto-dismissing stack into
 * a portal at `document.body` so it escapes any card/modal overflow clipping.
 *
 * Each toast shows a tinted check chip, an optional uppercase eyebrow
 * (`label`), and the primary `text` (the copied value, rendered monospace).
 *
 * Dismissal is two-phase: at `TOAST_TTL_MS` the toast is flagged `leaving` (the
 * CSS plays a fade/scale/collapse outro), then removed from the DOM once that
 * `TOAST_EXIT_MS` animation has finished — so it bows out gracefully instead of
 * popping away.
 */
export function ToastLayer() {
  const [toasts, setToasts] = useState<DisplayToast[]>([]);

  useEffect(() => {
    const timers = new Set<number>();
    const schedule = (fn: () => void, delay: number) => {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        fn();
      }, delay);
      timers.add(timer);
    };

    const unsubscribe = subscribeToToasts((toast) => {
      setToasts((current) => [...current, { ...toast, leaving: false }]);
      // Phase 1: start the outro after the visible dwell.
      schedule(() => {
        setToasts((current) =>
          current.map((t) => (t.id === toast.id ? { ...t, leaving: true } : t)),
        );
        // Phase 2: drop it once the outro animation has played out.
        schedule(() => {
          setToasts((current) => current.filter((t) => t.id !== toast.id));
        }, TOAST_EXIT_MS);
      }, TOAST_TTL_MS);
    });

    return () => {
      unsubscribe();
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, []);

  if (toasts.length === 0) return null;

  return createPortal(
    <div className="toast-layer" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast" data-kind={toast.kind} data-leaving={toast.leaving}>
          <span className="toast-icon" aria-hidden="true">
            <CheckIcon />
          </span>
          <span className="toast-body">
            {toast.label ? <span className="toast-label">{toast.label}</span> : null}
            <span className="toast-value">{toast.text}</span>
          </span>
        </div>
      ))}
    </div>,
    document.body,
  );
}
