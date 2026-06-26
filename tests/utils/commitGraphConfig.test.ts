import { describe, expect, it } from "vitest";
import { LANE_COLORS, laneColor } from "../../src/utils/commitGraphConfig";

describe("commitGraphConfig laneColor", () => {
  it("returns the palette color for an in-range lane", () => {
    expect(laneColor(0)).toBe(LANE_COLORS[0]);
    expect(laneColor(4)).toBe(LANE_COLORS[4]);
    expect(laneColor(LANE_COLORS.length - 1)).toBe(LANE_COLORS[LANE_COLORS.length - 1]);
  });

  it("wraps around once the lane exceeds the palette length", () => {
    expect(laneColor(LANE_COLORS.length)).toBe(LANE_COLORS[0]);
    expect(laneColor(LANE_COLORS.length + 2)).toBe(LANE_COLORS[2]);
  });

  it("falls back to blue for a negative/out-of-range lane", () => {
    // -1 % length is -1 in JS, so LANE_COLORS[-1] is undefined → fallback.
    expect(laneColor(-1)).toBe("#3b82f6");
  });
});
