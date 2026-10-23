import { expect, it } from "vitest";
import { h1Trend, isSwingPos, swingManage } from "./swing";

const bars = (f: (i: number) => number, n = 260) => Array.from({ length: n }, (_, i) => { const c = f(i); return { time: i, open: c - 0.2, high: c + 0.5, low: c - 0.5, close: c, volume: 1 }; });

it("reads an up trend on 1H", () => expect(h1Trend(bars((i) => 4000 + i))).toBe("long"));
it("reads a down trend on 1H", () => expect(h1Trend(bars((i) => 4300 - i))).toBe("short"));
it("treats a 5-point stop as swing and a 3-point stop as turbo", () => {
  expect(isSwingPos({ price_open: 4100, sl: 4095 })).toBe(true);
  expect(isSwingPos({ price_open: 4100, sl: 4097 })).toBe(false);
});
it("secures a swing at +4 points", () => {
  expect(swingManage({ type: "BUY", price_open: 4100, sl: 4094 }, 4104.1)).toBe("BREAKEVEN");
  expect(swingManage({ type: "BUY", price_open: 4100, sl: 4094 }, 4102)).toBe("hold");
});
it("swing targets 6-12 points with stop 3.5-5 and R:R 2", async () => {
  const { SWING } = await import("./swing");
  expect([SWING.minSl, SWING.maxSl, SWING.minTp, SWING.maxTp, SWING.minRr]).toEqual([3.5, 5, 6, 12, 2]);
});
it("a 3.5-point stop counts as swing, a 3-point turbo stop does not", () => {
  expect(isSwingPos({ price_open: 4100, sl: 4096.5 })).toBe(true);
  expect(isSwingPos({ price_open: 4100, sl: 4097 })).toBe(false);
});
