import { test, expect } from "vitest";
import { reversalSignal, rsiLast } from "./reversal";
test("no short when 5m RSI < 25", () => {
  const m5 = Array.from({ length: 30 }, (_, i) => { const o = 4100 - i * 2; return { open: o, high: o + 0.2, low: o - 2.2, close: o - 2 }; });
  expect(rsiLast(m5.map((k) => k.close))!).toBeLessThan(25);
  expect(reversalSignal(m5, [], [])).toBeNull();
});
