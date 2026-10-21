import { describe, it, expect } from "vitest";
import { sniperLiteBracket, sniperLiteSignal } from "./sniper-lite";

const bars = (n: number, f: (i: number) => [number, number, number, number]) =>
  Array.from({ length: n }, (_, i) => { const [open, high, low, close] = f(i); return { time: i * 60, open, high, low, close, volume: 1 }; });

describe("sniper lite", () => {
  it("bracket: SL 1.2×ATR, TP 1.8×ATR, BE 0.8×ATR", () => {
    expect(sniperLiteBracket("long", 100, 1)).toEqual({ stop: 98.8, target: 101.8, be: 100.8 });
    expect(sniperLiteBracket("short", 100, 1)).toEqual({ stop: 101.2, target: 98.2, be: 99.2 });
  });
  it("rejects a candle whose body is under 40% of its range", () => {
    const c = bars(40, (i) => [100 + i * 0.1, 100 + i * 0.1 + 0.5, 100 + i * 0.1 - 0.5, 100 + i * 0.1 + 0.05]);
    expect(sniperLiteSignal(c)?.side).toBeNull();
    expect(sniperLiteSignal(c)?.reason).toContain("شمعة ضعيفة");
  });
});
