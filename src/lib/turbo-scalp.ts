// TURBO_SCALP_1M: loose 1m momentum entry for choppy gold — candle direction + EMA9 (or prior-bar break) + wide RSI, body ≥20%.
// Quick bracket in gold points: TP = points, SL = 1.1×points.
import { ema, rsi, type Side } from "@/lib/trading";
import type { Bar } from "@/lib/smart-scalp";

export const TURBO = { minBody: 0.2, points: 2.5, slMult: 1.1, longRsi: [42, 76], shortRsi: [24, 58] } as const;

export type TurboSignal = { side: Side | null; reason: string; rsi: number };

export function turboSignal(c1: Bar[]): TurboSignal | null {
  const n = c1.length - 1;
  if (n < 20) return null;
  const closes = c1.map((k) => k.close);
  const bar = c1[n]!, prev = c1[n - 1]!;
  const e9 = ema(closes, 9)[n]!, r = rsi(closes, 9)[n]!;
  if (![e9, r].every(Number.isFinite)) return null;
  const range = bar.high - bar.low;
  const body = range > 0 ? Math.abs(bar.close - bar.open) / range : 0;
  if (body < TURBO.minBody) return { side: null, rsi: r, reason: "شمعة دوجي بدون حركة" };
  if (bar.close > bar.open && (bar.close >= e9 || bar.close > prev.high) && r >= TURBO.longRsi[0] && r <= TURBO.longRsi[1])
    return { side: "long", rsi: r, reason: `تيربو شراء | RSI ${r.toFixed(1)}` };
  if (bar.close < bar.open && (bar.close <= e9 || bar.close < prev.low) && r >= TURBO.shortRsi[0] && r <= TURBO.shortRsi[1])
    return { side: "short", rsi: r, reason: `تيربو بيع | RSI ${r.toFixed(1)}` };
  return { side: null, rsi: r, reason: `مراقبة التذبذب (RSI ${r.toFixed(1)})` };
}

export function turboBracket(side: Side, entry: number) {
  const d = side === "long" ? 1 : -1;
  return { stop: entry - d * TURBO.points * TURBO.slMult, target: entry + d * TURBO.points };
}
