// SNIPER_1M lite: 3 rules on the last closed 1m bar — EMA 9/21 trend, RSI 9 not stretched, clean body (≥40%).
import { atr, ema, rsi, type Side } from "@/lib/trading";
import type { Bar } from "@/lib/smart-scalp";

export const LITE = { minBody: 0.4, maxChaseAtr: 1.8, slAtr: 1.2, tpAtr: 1.8, beAtr: 0.8, longRsi: [52, 70], shortRsi: [30, 48] } as const;

export type LiteSignal = { side: Side | null; reason: string; atr: number; rsi: number };

export function sniperLiteSignal(c1: Bar[]): LiteSignal | null {
  const n = c1.length - 1;
  if (n < 30) return null;
  const closes = c1.map((k) => k.close);
  const bar = c1[n]!;
  const e9 = ema(closes, 9)[n]!, e21 = ema(closes, 21)[n]!;
  const r = rsi(closes, 9)[n]!;
  const a = atr(c1, 14)[n] ?? bar.close * 0.0015;
  if (![e9, e21, r, a].every(Number.isFinite)) return null;
  const base = { atr: a, rsi: r };
  const range = bar.high - bar.low;
  const body = range > 0 ? Math.abs(bar.close - bar.open) / range : 0;
  if (body < LITE.minBody) return { ...base, side: null, reason: "شمعة ضعيفة/ذيول طويلة" };
  if (Math.abs(bar.close - e9) > LITE.maxChaseAtr * a) return { ...base, side: null, reason: "السعر بعيد عن EMA9 (منع المطاردة)" };
  if (bar.close > bar.open && e9 > e21 && bar.close > e9 && r >= LITE.longRsi[0] && r <= LITE.longRsi[1])
    return { ...base, side: "long", reason: `شراء قناص 1د | RSI ${r.toFixed(1)} | EMA صاعد` };
  if (bar.close < bar.open && e9 < e21 && bar.close < e9 && r >= LITE.shortRsi[0] && r <= LITE.shortRsi[1])
    return { ...base, side: "short", reason: `بيع قناص 1د | RSI ${r.toFixed(1)} | EMA هابط` };
  return { ...base, side: null, reason: `انتظار فرصة (RSI ${r.toFixed(1)})` };
}

/** SL 1.2×ATR, TP 1.8×ATR, breakeven trigger 0.8×ATR. */
export function sniperLiteBracket(side: Side, entry: number, a: number) {
  const d = side === "long" ? 1 : -1;
  return { stop: entry - d * LITE.slAtr * a, target: entry + d * LITE.tpAtr * a, be: entry + d * LITE.beAtr * a };
}
