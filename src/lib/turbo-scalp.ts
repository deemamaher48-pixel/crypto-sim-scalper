// TURBO_SCALP_1M: loose 1m momentum entry for choppy gold — candle direction + EMA9 (or prior-bar break) + wide RSI, body ≥20%.
// Quick bracket in gold points: TP = points, SL = 1.1×points.
import { ema, rsi, type Side } from "@/lib/trading";
import type { Bar } from "@/lib/smart-scalp";

export const TURBO = { minBody: 0.15, points: 2.5, slMult: 1.1, longRsi: [42, 76], shortRsi: [24, 58] } as const;

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
  const chase = chaseBlock(c1, e9);
  if (bar.close > bar.open && (bar.close >= e9 || bar.close > prev.high) && r >= TURBO.longRsi[0] && r <= TURBO.longRsi[1])
    return chase === "long" ? { side: null, rsi: r, reason: "منع شراء بالقمة — صعود متمدد، ننتظر تصحيح" } : { side: "long", rsi: r, reason: `تيربو شراء | RSI ${r.toFixed(1)}` };
  if (bar.close < bar.open && (bar.close <= e9 || bar.close < prev.low) && r >= TURBO.shortRsi[0] && r <= TURBO.shortRsi[1])
    return chase === "short" ? { side: null, rsi: r, reason: "منع بيع بالقاع — هبوط متمدد، ننتظر تصحيح" } : { side: "short", rsi: r, reason: `تيربو بيع | RSI ${r.toFixed(1)}` };
  return { side: null, rsi: r, reason: `مراقبة التذبذب (RSI ${r.toFixed(1)})` };
}

export function turboBracket(side: Side, entry: number) {
  const d = side === "long" ? 1 : -1;
  return { stop: entry - d * TURBO.points * TURBO.slMult, target: entry + d * TURBO.points };
}

/** Anti-chasing: blocks entries after an extended run (5 same-color bars, or close stretched > 2× avg range from EMA9). */
export function chaseBlock(c1: Bar[], e9: number): Side | null {
  const n = c1.length - 1;
  const last = c1.slice(n - 4);
  const avgRange = c1.slice(n - 13).reduce((a, k) => a + (k.high - k.low), 0) / 14;
  const stretch = avgRange > 0 ? (c1[n]!.close - e9) / avgRange : 0;
  if (last.every((k) => k.close > k.open) || stretch > 2.0) return "long";
  if (last.every((k) => k.close < k.open) || stretch < -2.0) return "short";
  return null;
}

/** Signal strength 0-4: strong body, EMA9 slope with trade, RSI in healthy momentum zone, reward/risk ≥ 2. */
export function signalStrength(side: Side, c1: Bar[], rr: number): number {
  const n = c1.length - 1, bar = c1[n]!;
  const closes = c1.map((k) => k.close);
  const e = ema(closes, 9), r = rsi(closes, 9)[n]!;
  const range = bar.high - bar.low;
  const body = range > 0 ? Math.abs(bar.close - bar.open) / range : 0;
  const slope = (e[n]! - e[n - 3]!) * (side === "long" ? 1 : -1);
  const rsiOk = side === "long" ? r >= 52 && r <= 68 : r >= 32 && r <= 48;
  return (body >= 0.6 ? 1 : 0) + (slope > 0 ? 1 : 0) + (rsiOk ? 1 : 0) + (rr >= 2 ? 1 : 0);
}

/** Dynamic lot: base lot normally; 2× only at full strength (4/4), 1.5× at 3/4; never above maxLot. */
export function dynamicLot(base: number, strength: number, maxLot = 0.03): number {
  const m = strength >= 4 ? 2 : strength === 3 ? 1.5 : 1;
  return Math.min(maxLot, Math.max(base, Math.round(base * m * 100) / 100));
}
