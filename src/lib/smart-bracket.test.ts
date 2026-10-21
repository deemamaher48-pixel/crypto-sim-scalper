import { describe, expect, it } from "vitest";
import { smartBracket } from "./smart-bracket";

const flat = (n: number, lo: number, hi: number) =>
  Array.from({ length: n }, (_, i) => ({ time: i, open: (lo + hi) / 2, high: hi, low: lo, close: (lo + hi) / 2, volume: 1 }));

describe("smartBracket", () => {
  it("uses a stop under 1 point when the recent low is close", () => {
    const bars = flat(25, 99.7, 102); // swing low 0.3 below entry
    const r = smartBracket("long", 100, bars, 2, 5);
    expect(r.ok && r.slPts).toBe(0.5); // swing 0.3 + 0.15 buffer -> min 0.5, not the fixed 2
  });

  it("never exceeds the user's max stop", () => {
    const bars = flat(25, 95, 110);
    const r = smartBracket("long", 100, bars, 2, 15);
    expect(r.ok && r.slPts).toBe(2);
  });

  it("puts the target just before a nearby resistance (1.5 instead of 2)", () => {
    const bars = flat(25, 99.6, 101.6);
    const r = smartBracket("long", 100, bars, 2, 2);
    expect(r.ok && r.tpPts).toBe(1.5);
  });

  it("skips the trade when resistance is too close", () => {
    const bars = flat(25, 99, 100.3);
    expect(smartBracket("long", 100, bars, 2, 2).ok).toBe(false);
  });
});
