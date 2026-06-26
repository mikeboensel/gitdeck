/**
 * Tiny framework-agnostic toast bus. Decoupled from React on purpose: the call
 * sites that fire toasts (the pure `src/menus/*` builders, clipboard helpers)
 * have no hooks, so they push messages onto this bus and the single
 * `ToastLayer` mounted at the app root subscribes and renders them.
 */

export type ToastKind = "success" | "error";

export interface Toast {
  /** Monotonic id, used as the React key and for dismissal. */
  id: number;
  /** Primary line. For copy toasts this is the copied value (rendered mono). */
  text: string;
  kind: ToastKind;
  /** Optional eyebrow above `text` (e.g. "Copied to clipboard"). */
  label?: string;
}

interface ToastOptions {
  kind?: ToastKind;
  label?: string;
}

type Listener = (toast: Toast) => void;

const listeners = new Set<Listener>();
let nextId = 0;

/** Push a toast to every mounted listener. No-op if none are subscribed yet. */
export function showToast(text: string, options: ToastOptions = {}): void {
  const toast: Toast = {
    id: ++nextId,
    text,
    kind: options.kind ?? "success",
    label: options.label,
  };
  for (const listener of listeners) listener(toast);
}

/** Subscribe to toasts. Returns an unsubscribe function. */
export function subscribeToToasts(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
