import { test, expect } from "bun:test";
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
