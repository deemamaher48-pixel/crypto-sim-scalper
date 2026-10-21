import { describe, expect, it } from "vitest";
import { turboBracket, turboSignal } from "./turbo-scalp";

const bar = (o: number, c: number, t: number) => ({ time: t, open: o, close: c, high: Math.max(o, c) + 0.1, low: Math.min(o, c) - 0.1, volume: 1 });

describe("turbo scalp", () => {
  it("bracket is TP 2.5 points and SL 2.75 points", () => {
    const b = turboBracket("long", 4125);
    expect(b.target).toBeCloseTo(4127.5);
    expect(b.stop).toBeCloseTo(4122.25);
  });
  it("buys a green bar above EMA9 after mixed chop", () => {
    const bars = Array.from({ length: 30 }, (_, i) => bar(4125 + (i % 2 ? 0.3 : 0), 4125 + (i % 2 ? 0 : 0.3), i));
    bars.push(bar(4125.2, 4126, 31));
    expect(turboSignal(bars)?.side).toBe("long");
  });
});
