import { describe, expect, it } from "vitest";
import { smartBracket } from "./smart-bracket";

const flat = (n: number, lo: number, hi: number) =>
  Array.from({ length: n }, (_, i) => ({ time: i, open: (lo + hi) / 2, high: hi, low: lo, close: (lo + hi) / 2, volume: 1 }));

describe("smartBracket", () => {
  it("never uses a stop under 1.5 points", () => {
    const bars = flat(25, 99.7, 99.95);
    const r = smartBracket("long", 100, bars, 3, 4.5);
    expect(r.ok && r.slPts).toBe(1.5);
  });

  it("never exceeds the user's max stop", () => {
    const bars = flat(25, 95, 110);
    const r = smartBracket("long", 100, bars, 2, 15);
    expect(r.ok && r.slPts).toBe(2);
  });

  it("skips when resistance leaves a target under 2.5 points", () => {
    const bars = flat(25, 99.6, 101.6);
    expect(smartBracket("long", 100, bars, 3, 4.5).ok).toBe(false);
  });

  it("skips the trade when resistance is too close", () => {
    const bars = flat(25, 99, 100.3);
    expect(smartBracket("long", 100, bars, 2, 2).ok).toBe(false);
  });
});

import { smartBracket as sb2 } from "./smart-bracket";
import { it as it2, expect as ex2 } from "vitest";
it2("calm market caps target near 2.5 points instead of the 4.5 max", () => {
  const bars = Array.from({ length: 30 }, (_, i) => ({ time: i, open: 100, close: 100 + (i % 2 ? 0.1 : -0.1), high: 100.3, low: 99.7, volume: 1 }));
  const r = sb2("long", 100, bars as never, 3, 4.5);
  ex2(r.ok && r.tpPts).toBe(2.5);
});
it2("trend allows the full 4.5 target", () => {
  const bars = Array.from({ length: 30 }, (_, i) => ({ time: i, open: 100 + i * 0.5, close: 100.5 + i * 0.5, high: 100.6 + i * 0.5, low: 99.9 + i * 0.5, volume: 1 }));
  const r = sb2("long", 115.5, bars as never, 3, 4.5);
  ex2(r.ok && r.tpPts).toBe(4.5);
});
