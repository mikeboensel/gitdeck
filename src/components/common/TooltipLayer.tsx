import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { computeTooltipPosition, type TooltipPosition } from "../../utils/tooltip";

/**
 * Single delegated tooltip layer, mounted once at the app root. It listens at
 * the document level for hover/focus on any `[data-tip]` element and renders one
 * bubble into a portal at `document.body`.
 *
 * Why a portal: the old `.tip::after` pseudo-element lived *inside* the trigger,
 * so any ancestor with `overflow: hidden` (every card) clipped it, and stacking
 * contexts trapped its z-index. A body-level fixed-position bubble escapes both.
 * Positioning math lives in `utils/tooltip` (pure + unit-tested).
 *
 * Accessibility: the bubble is decorative (`aria-hidden`) — the accessible name
 * for icon-only controls is still their `aria-label`. We reveal on keyboard
 * focus too (the old CSS only did for focusable elements) and dismiss on Escape
 * without swallowing the event, so modal/card Escape-to-close keeps working.
 */
export function TooltipLayer() {
  const [active, setActive] = useState<{ anchor: HTMLElement; text: string } | null>(null);
  const [coords, setCoords] = useState<TooltipPosition | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const hoverAnchorRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const delayRef = useRef(400);

  // Resolve the reveal delay from the shared `--tip-delay` token ("0.4s").
  // parseFloat → 0.4 → 400ms; parseInt would yield 0 and kill the delay.
  useEffect(() => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--tip-delay");
    const ms = Number.parseFloat(raw) * 1000;
    delayRef.current = Number.isFinite(ms) && ms > 0 ? ms : 400;
  }, []);

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current !== undefined) {
        window.clearTimeout(timerRef.current);
        timerRef.current = undefined;
      }
    };
    const hide = () => {
      clearTimer();
      hoverAnchorRef.current = null;
      setActive(null);
      setCoords(null);
    };
    const findAnchor = (node: EventTarget | null): HTMLElement | null => {
      if (!(node instanceof Element)) return null;
      const el = node.closest<HTMLElement>("[data-tip]");
      return el?.getAttribute("data-tip")?.trim() ? el : null;
    };
    const open = (anchor: HTMLElement, immediate: boolean) => {
      const text = anchor.getAttribute("data-tip")?.trim();
      if (!text) return;
      if (hoverAnchorRef.current === anchor) return; // already pending/shown for this anchor
      clearTimer();
      hoverAnchorRef.current = anchor;
      const reveal = () => setActive({ anchor, text });
      if (immediate) reveal();
      else timerRef.current = window.setTimeout(reveal, delayRef.current);
    };

    const onPointerOver = (e: PointerEvent) => {
      // Touch taps would show a tooltip that then needs a tap-away to dismiss;
      // skip them (same effective behavior as the old CSS :hover on touch).
      if (e.pointerType === "touch") return;
      const anchor = findAnchor(e.target);
      if (anchor) open(anchor, false);
    };
    const onPointerOut = (e: PointerEvent) => {
      const anchor = hoverAnchorRef.current;
      if (!anchor) return;
      // Ignore moves that stay within the same anchor (anchors wrap svg + text,
      // so pointerout fires at every child boundary).
      const related = e.relatedTarget;
      if (related instanceof Node && anchor.contains(related)) return;
      hide();
    };
    const onFocusIn = (e: FocusEvent) => {
      const anchor = findAnchor(e.target);
      if (anchor) open(anchor, true); // keyboard focus reveals immediately
    };
    const onFocusOut = (e: FocusEvent) => {
      const anchor = hoverAnchorRef.current;
      if (!anchor) return;
      const related = e.relatedTarget;
      if (related instanceof Node && anchor.contains(related)) return;
      hide();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      // Passive: only act when a tooltip is up, and never preventDefault/stop —
      // Escape must still propagate to modal/card close handlers.
      if (e.key === "Escape" && hoverAnchorRef.current) hide();
    };

    document.addEventListener("pointerover", onPointerOver);
    document.addEventListener("pointerout", onPointerOut);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("keydown", onKeyDown);
    // Hide on scroll/resize rather than chase the anchor — positions go stale fast.
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);

    return () => {
      clearTimer();
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("pointerout", onPointerOut);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, []);

  // Measure the rendered bubble and position it. Runs after the bubble paints
  // (it renders invisibly until coords exist) so offsetWidth/Height are real.
  useLayoutEffect(() => {
    if (!active) return;
    if (!active.anchor.isConnected) {
      // Anchor unmounted mid-hover (list re-render) — drop the tooltip.
      hoverAnchorRef.current = null;
      setActive(null);
      setCoords(null);
      return;
    }
    const bubble = bubbleRef.current;
    if (!bubble) return;
    const rect = active.anchor.getBoundingClientRect();
    setCoords(
      computeTooltipPosition(
        { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width },
        { width: bubble.offsetWidth, height: bubble.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [active]);

  if (!active) return null;

  return createPortal(
    <div
      ref={bubbleRef}
      className="tooltip-bubble"
      aria-hidden="true"
      data-placement={coords?.placement}
      style={
        coords
          ? { top: coords.top, left: coords.left, opacity: 1 }
          : // First paint: render off-screen + invisible so we can measure it.
            { top: 0, left: 0, opacity: 0 }
      }
    >
      {active.text}
    </div>,
    document.body,
  );
}
