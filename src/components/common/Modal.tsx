import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { CloseIcon, CompressIcon, ExpandIcon } from "./Icons";

// ── Escape stack ───────────────────────────────────────────────────────────
// Modals can stack (e.g. the command palette over a repo modal). A single
// module-level stack + one window listener guarantees Escape closes only the
// topmost modal, replacing the per-modal keydown effects that used to duplicate
// this and could double-close stacked modals.
const escStack: Array<() => void> = [];
let escListening = false;

function onEscape(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  const top = escStack[escStack.length - 1];
  if (!top) return;
  event.preventDefault();
  top();
}

function pushEsc(close: () => void) {
  escStack.push(close);
  if (!escListening) {
    window.addEventListener("keydown", onEscape);
    escListening = true;
  }
}

function popEsc(close: () => void) {
  const i = escStack.lastIndexOf(close);
  if (i >= 0) escStack.splice(i, 1);
  if (escStack.length === 0 && escListening) {
    window.removeEventListener("keydown", onEscape);
    escListening = false;
  }
}

/** True while any {@link Modal} (or {@link useModalEscape} consumer) is mounted — lets non-modal overlays skip their own Escape handling when a modal is on top. */
export function hasOpenModal() {
  return escStack.length > 0;
}

/**
 * Registers an overlay on the shared Escape stack without the {@link Modal}
 * shell, for overlays with bespoke chrome (command palette, account picker).
 * Escape closes the topmost registered overlay, so all modals share one
 * ordering authority rather than racing separate listeners.
 */
export function useModalEscape(onClose: () => void, enabled = true) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!enabled) return;
    const close = () => closeRef.current();
    pushEsc(close);
    return () => popEsc(close);
  }, [enabled]);
}

// ── Fullscreen hotkey ("F") ──────────────────────────────────────────────────
// Mirrors the Escape stack: "F" toggles fullscreen on the topmost modal. Only
// Modal instances (which own a fullscreen state) register here.
const fsStack: Array<() => void> = [];
let fsListening = false;

/** Don't hijack "f" while the user is typing into a field (e.g. the alias input). */
function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function onFullscreenKey(event: KeyboardEvent) {
  if (event.key !== "f" && event.key !== "F") return;
  if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
  const top = fsStack[fsStack.length - 1];
  if (!top) return;
  event.preventDefault();
  top();
}

function pushFs(toggle: () => void) {
  fsStack.push(toggle);
  if (!fsListening) {
    window.addEventListener("keydown", onFullscreenKey);
    fsListening = true;
  }
}

function popFs(toggle: () => void) {
  const i = fsStack.lastIndexOf(toggle);
  if (i >= 0) fsStack.splice(i, 1);
  if (fsStack.length === 0 && fsListening) {
    window.removeEventListener("keydown", onFullscreenKey);
    fsListening = false;
  }
}

// ── Resize ─────────────────────────────────────────────────────────────────
const RESIZE_DIRS = ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const;
const MIN_W = 360;
const MIN_H = 220;
const VIEWPORT_MARGIN = 16;

interface ModalProps {
  /** Size/variant class appended to `.modal` (e.g. `"history-modal"`). */
  className?: string;
  ariaLabel?: string;
  onClose: () => void;
  /** Left side of the header bar — typically `.modal-icon` + title block. Wrapped in `.modal-title`. */
  title: ReactNode;
  /** Optional controls placed in the header bar before the fullscreen/close buttons. */
  headerExtra?: ReactNode;
  children: ReactNode;
}

/**
 * Shared modal shell: backdrop (click-to-close), header (title + fullscreen +
 * close), Escape-to-close (topmost only, see {@link escStack}), drag-to-resize
 * from any edge/corner, and a fullscreen toggle. All app modals render through
 * this so the chrome — and these affordances — stay DRY.
 */
export function Modal({ className, ariaLabel, onClose, title, headerExtra, children }: ModalProps) {
  const { t } = useI18n();
  const modalRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  // Escape closes the topmost modal (shared stack — see useModalEscape).
  useModalEscape(onClose);

  // "F" toggles fullscreen on the topmost modal (shared stack — mirrors Esc).
  useEffect(() => {
    const toggle = () => setFullscreen((f) => !f);
    pushFs(toggle);
    return () => popFs(toggle);
  }, []);

  const startResize = useCallback(
    (dir: (typeof RESIZE_DIRS)[number]) => (event: React.PointerEvent) => {
      const el = modalRef.current;
      if (!el) return;
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      const startW = rect.width;
      const startH = rect.height;
      const east = dir.includes("e");
      const west = dir.includes("w");
      const north = dir.includes("n");
      const south = dir.includes("s");

      function move(ev: PointerEvent) {
        // The modal is center-anchored, so each edge moves at half the size
        // delta; doubling the cursor delta keeps the dragged edge under the
        // pointer.
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        let w = startW;
        let h = startH;
        if (east) w = startW + dx * 2;
        if (west) w = startW - dx * 2;
        if (south) h = startH + dy * 2;
        if (north) h = startH - dy * 2;
        w = Math.max(MIN_W, Math.min(w, window.innerWidth - VIEWPORT_MARGIN));
        h = Math.max(MIN_H, Math.min(h, window.innerHeight - VIEWPORT_MARGIN));
        setSize({ w, h });
      }
      function up() {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        document.body.style.userSelect = "";
      }
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [],
  );

  // Fullscreen wins over a manual size; the class drives dimensions.
  const style = fullscreen || !size ? undefined : { width: size.w, height: size.h };

  return (
    <div className="modal-root">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-close; keyboard users close via the visible Close button / Esc */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click-to-close; keyboard users close via the visible Close button / Esc */}
      <div className="modal-backdrop" onClick={onClose} />
      <div
        ref={modalRef}
        className={`modal${className ? ` ${className}` : ""}${fullscreen ? " fullscreen" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        style={style}
      >
        <header className="modal-head">
          <div className="modal-title">{title}</div>
          <div className="modal-head-actions">
            {headerExtra}
            <button
              type="button"
              className="modal-action"
              aria-label={fullscreen ? t("common.exitFullscreen") : t("common.fullscreen")}
              data-tip={`${fullscreen ? t("common.exitFullscreen") : t("common.fullscreen")} (F)`}
              onClick={() => setFullscreen((f) => !f)}
            >
              {fullscreen ? <CompressIcon /> : <ExpandIcon />}
            </button>
            <button
              type="button"
              className="modal-close"
              aria-label={t("common.close")}
              data-tip={`${t("common.close")} (Esc)`}
              onClick={onClose}
            >
              <CloseIcon />
            </button>
          </div>
        </header>

        {children}

        {fullscreen
          ? null
          : RESIZE_DIRS.map((dir) => (
              <div
                key={dir}
                className={`modal-resize modal-resize-${dir}`}
                onPointerDown={startResize(dir)}
              />
            ))}
      </div>
    </div>
  );
}
