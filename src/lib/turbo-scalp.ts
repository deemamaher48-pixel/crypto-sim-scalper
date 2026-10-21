// TURBO_SCALP_1M: loose 1m momentum entry for choppy gold — candle direction + EMA9 (or prior-bar break) + wide RSI, body ≥20%.
// Quick bracket in gold points: TP = points, SL = 1.1×points.
import { adx, atr, ema, rsi, type Side } from "@/lib/trading";
import type { Bar } from "@/lib/smart-scalp";

export const TURBO = { minBody: 0.45, closeThird: 1 / 3, spreadAtr: 0.4, minAdx: 20, points: 2.5, slMult: 1.1, longRsi: [42, 76], shortRsi: [24, 58] } as const;

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
  const pos = range > 0 ? (bar.close - bar.low) / range : 0.5;
  const chase = chaseBlock(c1, e9);
  const trend = trendBias(c1);
  const gate = (side: Side): string | null => {
    if (trend === (side === "long" ? "short" : "long")) return side === "long" ? "منع شراء عكس الترند الهابط" : "منع بيع عكس الترند الصاعد";
    if (flushAgainst(c1, side)) return side === "long" ? "انهيار حاد — ننتظر قاع واضح" : "انفجار صعود حاد — ننتظر قمة واضحة";
    const chop = chopReason(c1, side);
    if (chop) return chop;
    if (side === "long" ? pos < 1 - TURBO.closeThird : pos > TURBO.closeThird) return side === "long" ? "الإغلاق مو بالثلث العلوي" : "الإغلاق مو بالثلث السفلي";
    if (!pulledBack(c1, e9, side)) return side === "long" ? "ننتظر تصحيح للمتوسط قبل الشراء" : "ننتظر ارتداد للمتوسط قبل البيع";
    if (chase === side) return side === "long" ? "منع شراء بالقمة — صعود متمدد، ننتظر تصحيح" : "منع بيع بالقاع — هبوط متمدد، ننتظر تصحيح";
    return null;
  };
  if (bar.close > bar.open && (bar.close >= e9 || bar.close > prev.high) && r >= TURBO.longRsi[0] && r <= TURBO.longRsi[1]) {
    const no = gate("long");
    return no ? { side: null, rsi: r, reason: no } : { side: "long", rsi: r, reason: `تيربو شراء مع الترند بعد تصحيح | RSI ${r.toFixed(1)}` };
  }
  if (bar.close < bar.open && (bar.close <= e9 || bar.close < prev.low) && r >= TURBO.shortRsi[0] && r <= TURBO.shortRsi[1]) {
    const no = gate("short");
    return no ? { side: null, rsi: r, reason: no } : { side: "short", rsi: r, reason: `تيربو بيع مع الترند بعد ارتداد | RSI ${r.toFixed(1)}` };
  }
  return { side: null, rsi: r, reason: `مراقبة التذبذب (RSI ${r.toFixed(1)})` };
}

function avgRange(c1: Bar[], len = 14): number {
  const s = c1.slice(-len);
  return s.reduce((a, k) => a + (k.high - k.low), 0) / Math.max(1, s.length);
}

/** Trend bias from EMA21 vs EMA50 and price side of EMA50; null = no clear trend (chop). */
export function trendBias(c1: Bar[]): Side | null {
  const closes = c1.map((k) => k.close), n = c1.length - 1;
  const e21 = ema(closes, 21)[n]!, e50 = ema(closes, Math.min(50, n))[n]!;
  if (![e21, e50].every(Number.isFinite)) return null;
  const tol = 0.15 * avgRange(c1), close = closes[n]!;
  if (e21 > e50 + tol && close > e50) return "long";
  if (e21 < e50 - tol && close < e50) return "short";
  return null;
}

/** Chop filter: EMA21/50 gap ≥ 0.4×ATR14, EMA21 sloping our way over 3 bars, ADX14 > 20. */
export function chopReason(c1: Bar[], side: Side): string | null {
  const closes = c1.map((k) => k.close), n = c1.length - 1;
  const e21 = ema(closes, 21), e50 = ema(closes, Math.min(50, n))[n]!;
  const a = atr(c1, 14)[n]!, x = adx(c1, 14).adx[n]!;
  if (!Number.isFinite(a) || Math.abs(e21[n]! - e50) < TURBO.spreadAtr * a) return "المتوسطات متشابكة — سوق عرضي";
  const slope = (e21[n]! - e21[n - 3]!) * (side === "long" ? 1 : -1);
  if (!(slope > 0)) return "ميل EMA21 مو مع الاتجاه";
  if (!Number.isFinite(x) || x <= TURBO.minAdx) return `ADX ضعيف (${Number.isFinite(x) ? x.toFixed(1) : "-"})`;
  return null;
}

/** Pullback: one of the last 3 bars dipped (long) / rallied (short) back to EMA9. */
export function pulledBack(c1: Bar[], e9: number, side: Side): boolean {
  const last = c1.slice(-3), tol = 0.25 * avgRange(c1);
  return side === "long" ? Math.min(...last.map((k) => k.low)) <= e9 + tol : Math.max(...last.map((k) => k.high)) >= e9 - tol;
}

/** Flush guard: a big opposite bar (> 2× avg range) in the last 3 bars blocks the entry. */
export function flushAgainst(c1: Bar[], side: Side): boolean {
  const avg = avgRange(c1.slice(0, -3));
  return c1.slice(-3).some((k) => k.high - k.low > 2 * avg && (side === "long" ? k.close < k.open : k.close > k.open));
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
  const pts = (body >= 0.6 ? 1 : 0) + (slope > 0 ? 1 : 0) + (rsiOk ? 1 : 0) + (rr >= 2 ? 1 : 0);
  // Size-up only when the trend clearly agrees; otherwise cap strength at 2 (base lot).
  return trendBias(c1) === side ? pts : Math.min(pts, 2);
}

/** Dynamic lot: base lot normally; 2× only at full strength (4/4, trend-aligned); never above maxLot (0.02). */
export function dynamicLot(base: number, strength: number, maxLot = 0.02): number {
  const m = strength >= 4 ? 2 : 1;
  return Math.min(maxLot, Math.max(base, Math.round(base * m * 100) / 100));
}
