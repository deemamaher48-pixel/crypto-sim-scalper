import { describe, expect, it } from "vitest";
import { breakevenStop, inRolloverWindow, inCooldown, smartBracket, smartCandleExit, smartSignal, type Bar } from "./smart-scalp";

const bars = (n: number, f: (i: number) => Partial<Bar>): Bar[] =>
  Array.from({ length: n }, (_, i) => {
    const c = 100 + i * 0.05;
    return { time: 1_700_000_000 + i * 300, open: c - 0.02, high: c + 0.05, low: c - 0.05, close: c, volume: 10, ...f(i) };
  });

describe("Smart VWAP & Momentum", () => {
  it("SL is 1.5×ATR clamped to $1.5–$4; TP1 1.5×ATR; TP2 3×ATR", () => {
    const b = smartBracket("long", 2000, 2);
    expect(b.stop).toBeCloseTo(1997); expect(b.tp1).toBeCloseTo(2003); expect(b.target).toBeCloseTo(2006);
    expect(smartBracket("long", 2000, 0.5).stop).toBeCloseTo(1998.5);
    expect(smartBracket("short", 2000, 5).stop).toBeCloseTo(2004);
  });
  it("rollover window 23:00–01:00 UTC blocks entries", () => {
    expect(inRolloverWindow(Date.UTC(2026, 0, 1, 23, 30))).toBe(true);
    expect(inRolloverWindow(Date.UTC(2026, 0, 1, 0, 59))).toBe(true);
    expect(inRolloverWindow(Date.UTC(2026, 0, 1, 1, 0))).toBe(false);
  });
  it("cooldown blocks for 3 five-minute bars after a loss", () => {
    expect(inCooldown(0, 14 * 60_000)).toBe(true);
    expect(inCooldown(0, 15 * 60_000)).toBe(false);
  });
  it("breakeven stop covers the spread", () => {
    expect(breakevenStop("long", 100)).toBeGreaterThan(100);
    expect(breakevenStop("short", 100)).toBeLessThan(100);
  });
  it("no entry without a volume spike even in an uptrend", () => {
    const c = bars(80, () => ({}));
    const sig = smartSignal(c, c.filter((_, i) => i % 3 === 0));
    expect(sig?.side).toBeNull();
  });
  it("time-stop after 5 bars without 50% progress to TP1", () => {
    const c = bars(60, () => ({}));
    const t = { side: "long" as const, entry: 103, tp1: 104, tp1Hit: false, best: 103.4, openedAt: new Date(0).toISOString() };
    expect(smartCandleExit(t, c, 25 * 60_000)).toBe("time_stop");
    expect(smartCandleExit({ ...t, best: 103.6 }, c, 25 * 60_000)).toBeNull();
  });
});

import { describe as d2, it as i2, expect as e2 } from "vitest";
d2("smartBracket for BTC", () => {
  i2("uses raw 1.5×ATR stop without the gold $1.5–$4 clamp", () => {
    e2(smartBracket("long", 60000, 100, false).stop).toBeCloseTo(59850);
  });
});
