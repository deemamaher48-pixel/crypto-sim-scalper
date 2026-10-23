import { test, expect } from "vitest";
import { htfGate } from "./htf-gate";

const bars = (dir: 1 | -1) => Array.from({ length: 240 }, (_, i) => { const c = 4000 + dir * i; return { high: c + 1, low: c - 1, close: c }; });

test("blocks buy when 1H and 4H are falling", () => {
  expect(htfGate(bars(-1), "long")).not.toBeNull();
  expect(htfGate(bars(-1), "short")).toBeNull();
});

test("blocks sell when 1H and 4H are rising", () => {
  expect(htfGate(bars(1), "short")).not.toBeNull();
  expect(htfGate(bars(1), "long")).toBeNull();
});

import { counterTrendGuard } from "./htf-gate";
test("blocks a counter-trend buy on falling 1H unless 5m RSI < 30 or firm 5m buy", () => {
  expect(counterTrendGuard(bars(-1), [], "long", 45, null)).not.toBeNull();
  expect(counterTrendGuard(bars(-1), [], "long", 28, null)).toBeNull();
  expect(counterTrendGuard(bars(-1), [], "long", 45, "long")).toBeNull();
});
test("never touches with-trend turbo trades", () => {
  expect(counterTrendGuard(bars(-1), [], "short", 20, null)).toBeNull();
});
