import { describe, expect, it } from "vitest";
import { bracket, ema, exitCheck, floorToStep, riskGate, rsi } from "./trading";

const baseRisk = {
  hasOpenTrade: false,
  tradesToday: 0,
  maxTradesPerDay: 20,
  pnlToday: 0,
  maxDailyLossUsdt: 25,
  positionUsdt: 50,
  freeUsdt: 1000,
};

describe("trading rules", () => {
  it("places stop loss and take profit at the configured percentages", () => {
    const b = bracket(100, 0.5, 1);
    expect(b.stop).toBeCloseTo(99.5);
    expect(b.target).toBeCloseTo(101);
  });

  it("exits at stop loss when price falls to the stop", () => {
    expect(exitCheck(99.5, { stop_price: 99.5, target_price: 101 }, null)).toBe("stop_loss");
  });

  it("exits at take profit when price reaches the target", () => {
    expect(exitCheck(101.2, { stop_price: 99.5, target_price: 101 }, null)).toBe("take_profit");
  });

  it("blocks new trades after the daily loss limit", () => {
    expect(riskGate({ ...baseRisk, pnlToday: -25 }).ok).toBe(false);
  });

  it("blocks new trades after the max trades per day", () => {
    expect(riskGate({ ...baseRisk, tradesToday: 20 }).ok).toBe(false);
  });

  it("allows only one open trade at a time", () => {
    expect(riskGate({ ...baseRisk, hasOpenTrade: true }).ok).toBe(false);
    expect(riskGate(baseRisk).ok).toBe(true);
  });

  it("computes EMA and RSI", () => {
    expect(ema([1, 2, 3, 4], 2)[3]).toBeCloseTo(3.5);
    const up = Array.from({ length: 30 }, (_, i) => i + 1);
    expect(rsi(up, 14)[29]).toBe(100);
  });

  it("floors quantity to the lot step", () => {
    expect(floorToStep(0.0012345, 0.00001)).toBe(0.00123);
  });
});

import { paperBuy, paperSell } from "./trading";
describe("paper trading", () => {
  it("charges 0.1% per side so a flat round trip loses about 0.2%", () => {
    const b = paperBuy(100, 50000);
    const s = paperSell(b.qty, b.entry, 50000);
    expect(s.pnl).toBeCloseTo(-0.1999, 3);
  });
});

import { fastEntrySignal, entrySignal } from "./trading";
describe("fast scalping mode", () => {
  const p = { emaFast: 9, emaSlow: 21, rsiPeriod: 14, rsiOverbought: 70, rsiOversold: 30 };
  const uptrend = { emaFast: 101, emaSlow: 100, rsi: 55, prevEmaFast: 100.9, prevEmaSlow: 100, prevRsi: 54 };
  it("enters in an ongoing uptrend where normal mode waits for a cross", () => {
    expect(entrySignal(uptrend, p).buy).toBe(false);
    expect(fastEntrySignal(uptrend, p).buy).toBe(true);
  });
  it("still never buys when RSI is overbought", () => {
    expect(fastEntrySignal({ ...uptrend, rsi: 75 }, p).buy).toBe(false);
  });
});
