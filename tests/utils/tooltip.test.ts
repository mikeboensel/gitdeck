import { describe, expect, it } from "vitest";
import { computeTooltipPosition } from "../../src/utils/tooltip";

const viewport = { width: 1000, height: 800 };
const bubble = { width: 120, height: 40 };

describe("computeTooltipPosition", () => {
  it("places below and centered when there is room", () => {
    const anchor = { top: 100, bottom: 120, left: 400, width: 60 };
    const pos = computeTooltipPosition(anchor, bubble, viewport);
    expect(pos.placement).toBe("below");
    expect(pos.top).toBe(120 + 6); // bottom + gap
    expect(pos.left).toBe(400 + 60 / 2 - 120 / 2); // centered on anchor
  });

  it("flips above when there is no room below but room above", () => {
    const anchor = { top: 760, bottom: 790, left: 400, width: 60 };
    const pos = computeTooltipPosition(anchor, bubble, viewport);
    expect(pos.placement).toBe("above");
    expect(pos.top).toBe(760 - 6 - 40); // top - gap - bubbleHeight
  });

  it("clamps to the right edge when the anchor is near the right", () => {
    const anchor = { top: 100, bottom: 120, left: 980, width: 16 };
    const pos = computeTooltipPosition(anchor, bubble, viewport);
    // centered would overflow; clamp to viewport.width - bubble.width - margin
    expect(pos.left).toBe(1000 - 120 - 8);
  });

  it("clamps to the left edge when the anchor is near the left", () => {
    const anchor = { top: 100, bottom: 120, left: 0, width: 16 };
    const pos = computeTooltipPosition(anchor, bubble, viewport);
    expect(pos.left).toBe(8); // margin
  });

  it("pins a too-tall bubble to the top margin instead of off-screen", () => {
    const tall = { width: 120, height: 900 }; // taller than viewport
    const anchor = { top: 400, bottom: 420, left: 400, width: 60 };
    const pos = computeTooltipPosition(anchor, tall, viewport);
    expect(pos.top).toBe(8); // clamped to margin, never negative
  });

  it("respects custom gap and margin", () => {
    const anchor = { top: 100, bottom: 120, left: 400, width: 60 };
    const pos = computeTooltipPosition(anchor, bubble, viewport, { gap: 10, margin: 20 });
    expect(pos.top).toBe(130); // bottom + custom gap
  });
});
