/**
 * Pure positioning math for the portal tooltip (see `TooltipLayer`). Kept free
 * of DOM access so it can be unit-tested in isolation: callers pass in the
 * anchor's screen rect, the measured bubble size, and the viewport, and get back
 * fixed-position coordinates plus the chosen placement.
 *
 * This generalizes the per-element CSS hacks the old `.tip::after` system used
 * (flip-above, anchor-left/right): we prefer placing the bubble below the
 * anchor, flip above when there isn't room, and always clamp into the viewport
 * so a fixed-position bubble can never be clipped the way the old in-card
 * pseudo-element was.
 */

/** Minimal anchor rect (a subset of DOMRect — only what positioning needs). */
export interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  width: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface TooltipPosition {
  top: number;
  left: number;
  placement: "above" | "below";
}

export interface PositionOptions {
  /** Gap between the anchor edge and the bubble. */
  gap?: number;
  /** Minimum distance the bubble keeps from the viewport edges. */
  margin?: number;
}

function clamp(value: number, min: number, max: number): number {
  // When the available band is narrower than the bubble (max < min), pin to the
  // top/left margin and let CSS max-height/overflow handle the overrun.
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * Compute fixed-position coordinates for a tooltip bubble.
 *
 * Vertical: prefer below the anchor; flip above if the bubble doesn't fit below
 * but fits above; if it fits neither, pick the side with more room. `top` is
 * always clamped to keep the bubble's top edge on-screen.
 *
 * Horizontal: center on the anchor, then clamp so the bubble stays within the
 * viewport margins.
 */
export function computeTooltipPosition(
  anchor: AnchorRect,
  bubble: Size,
  viewport: Viewport,
  opts: PositionOptions = {},
): TooltipPosition {
  const gap = opts.gap ?? 6;
  const margin = opts.margin ?? 8;

  const spaceBelow = viewport.height - anchor.bottom;
  const spaceAbove = anchor.top;
  const needed = bubble.height + gap;

  let placement: "above" | "below";
  if (needed <= spaceBelow) {
    placement = "below";
  } else if (needed <= spaceAbove) {
    placement = "above";
  } else {
    // Fits neither — use the roomier side; CSS max-height/overflow-y absorbs the rest.
    placement = spaceBelow >= spaceAbove ? "below" : "above";
  }

  const rawTop = placement === "below" ? anchor.bottom + gap : anchor.top - gap - bubble.height;
  const top = clamp(rawTop, margin, viewport.height - bubble.height - margin);

  const centeredLeft = anchor.left + anchor.width / 2 - bubble.width / 2;
  const left = clamp(centeredLeft, margin, viewport.width - bubble.width - margin);

  return { top, left, placement };
}
