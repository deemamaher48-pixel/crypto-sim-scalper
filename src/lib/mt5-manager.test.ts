import { describe, expect, it } from "vitest";
import { manageDecision, movePts } from "./mt5-manager";

const flat = Array.from({ length: 30 }, (_, i) => ({ open: 100 + i * 0.1, high: 100.2 + i * 0.1, low: 99.9 + i * 0.1, close: 100.1 + i * 0.1 }));
const pos = (o: Partial<Parameters<typeof manageDecision>[0]>) => ({ ticket: 1, type: "BUY" as const, volume: 0.01, price_open: 4000, sl: 3997, tp: 4005, profit: 0, ...o });

describe("mt5 manager", () => {
  it("0.01 lot with $1.50 profit is 1.5 points", () => expect(movePts(pos({ profit: 1.5 }))).toBeCloseTo(1.5));
  it("secures entry at 1.5 points profit", () => expect(manageDecision(pos({ profit: 1.5 }), flat, false).action).toBe("BREAKEVEN"));
  it("does not secure twice", () => expect(manageDecision(pos({ profit: 1.5, sl: 4000 }), flat, false).action).toBe("hold"));
  it("takes half at 2 points on 0.02+ lots, once", () => {
    expect(manageDecision(pos({ volume: 0.04, profit: 8 }), flat, false)).toMatchObject({ action: "CLOSE_PARTIAL", lot: 0.02 });
    expect(manageDecision(pos({ volume: 0.04, profit: 8 }), flat, true).action).toBe("BREAKEVEN");
  });
  it("closes in profit on a strong opposite candle", () => {
    const bars = [...flat.slice(0, 29), { open: 103, high: 103.05, low: 101, close: 101.1 }];
    expect(manageDecision(pos({ profit: 1 }), bars, false).action).toBe("CLOSE");
  });
  it("holds a small loss", () => expect(manageDecision(pos({ profit: -0.5 }), flat, false).action).toBe("hold"));
});
