import { describe, expect, it } from "vitest";
import { firm, reversalSignal } from "./reversal";

const flat = (n: number, c = 100) => Array.from({ length: n }, () => ({ open: c, high: c + 0.5, low: c - 0.5, close: c }));

describe("reversal", () => {
  it("firm bullish 5m candle closing above prior high", () => {
    expect(firm([...flat(3), { open: 100, high: 103, low: 99.8, close: 102.8 }])).toBe("long");
  });
  it("weak body is not firm", () => {
    expect(firm([...flat(3), { open: 100, high: 103, low: 99, close: 101 }])).toBeNull();
  });
  it("blocked when 1H trend opposes", () => {
    const h1 = Array.from({ length: 120 }, (_, i) => { const c = 200 - i; return { open: c + 0.5, high: c + 1, low: c - 1, close: c }; });
    const m5 = [...flat(3), { open: 100, high: 103, low: 99.8, close: 102.8 }];
    expect(reversalSignal(m5, flat(5), h1)).toBeNull();
  });
  it("quick scalp when 1H neutral and no 15m confirmation", () => {
    const m5 = [...flat(3), { open: 100, high: 103, low: 99.8, close: 102.8 }];
    expect(reversalSignal(m5, flat(5), flat(120))?.strong).toBe(false);
  });
});
