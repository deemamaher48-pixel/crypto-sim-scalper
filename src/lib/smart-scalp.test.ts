import { describe, expect, it } from "vitest";
import { breakevenStop, inCooldown, smartBracket, smartCandleExit, smartSignal, type Bar } from "./smart-scalp";

const bars = (n: number, f: (i: number) => Partial<Bar>): Bar[] =>
  Array.from({ length: n }, (_, i) => {
    const c = 100 + i * 0.05;
    return { time: 1_700_000_000 + i * 300, open: c - 0.02, high: c + 0.05, low: c - 0.05, close: c, volume: 10, ...f(i) };
  });

describe("Smart VWAP & Momentum", () => {
  it("SL is 1.5×ATR capped at 0.7%; TP1 1.5×ATR; TP2 3×ATR", () => {
    expect(smartBracket("long", 100, 0.2)).toEqual({ stop: 99.7, tp1: 100.3, target: 100.6 });
    const wide = smartBracket("short", 100, 1);
    expect(wide.stop).toBeCloseTo(100.7);
    expect(wide.target).toBeCloseTo(97);
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
