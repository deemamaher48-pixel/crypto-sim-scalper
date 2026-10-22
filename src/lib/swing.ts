// SWING_15M: 1H trend (EMA50/200) + 15m break of structure with pullback to EMA21 and healthy RSI.
// Stop behind the last 15m swing (bounded), target at R:R ≥ 2.5 capped by the nearest 1H level.
import { adx, atr, ema, rsi, type Side } from "@/lib/trading";
import type { Bar } from "@/lib/smart-scalp";

export const SWING = { minSl: 4, maxSl: 7, minTp: 12, maxTp: 25, minRr: 2.5, minAdx: 18, look: 12, longRsi: [50, 66], shortRsi: [34, 50], beUsdPts: 4, lockStartPts: 8, lockPts: 4 } as const;

export type SwingSignal = { side: Side; stop: number; target: number; reason: string } | { side: null; reason: string };

export function h1Trend(h1: Bar[]): Side | null {
  const c = h1.map((k) => k.close), n = c.length - 1;
  if (n < 200) return null;
  const e50 = ema(c, 50)[n]!, e200 = ema(c, 200)[n]!, px = c[n]!;
  if (px > e50 && e50 > e200) return "long";
  if (px < e50 && e50 < e200) return "short";
  return null;
}

export function swingSignal(m15: Bar[], h1: Bar[], price: number): SwingSignal {
  const trend = h1Trend(h1);
  if (!trend) return { side: null, reason: "سوينغ: لا ترند واضح على الساعة" };
  const n = m15.length - 1;
  if (n < 60) return { side: null, reason: "سوينغ: بيانات غير كافية" };
  const c = m15.map((k) => k.close);
  const e21 = ema(c, 21)[n]!, r = rsi(c, 14)[n]!, a = adx(m15, 14).adx[n]!, at = atr(m15, 14)[n]!;
  if (![e21, r, a, at].every(Number.isFinite)) return { side: null, reason: "سوينغ: مؤشرات غير جاهزة" };
  if (a < SWING.minAdx) return { side: null, reason: `سوينغ: زخم ضعيف ADX ${a.toFixed(0)}` };
  const long = trend === "long";
  const prior = m15.slice(n - SWING.look - 3, n - 3);
  const bar = m15[n]!;
  // Break of structure: last 3 bars exceeded the prior swing high/low.
  const recent = m15.slice(n - 2, n + 1);
  const bos = long ? Math.max(...recent.map((k) => k.high)) > Math.max(...prior.map((k) => k.high)) : Math.min(...recent.map((k) => k.low)) < Math.min(...prior.map((k) => k.low));
  if (!bos) return { side: null, reason: "سوينغ: لا كسر هيكل" };
  const touched = long ? recent.some((k) => k.low <= e21 + at * 0.3) : recent.some((k) => k.high >= e21 - at * 0.3);
  if (!touched) return { side: null, reason: "سوينغ: بانتظار ارتداد لـ EMA21" };
  const [lo, hi] = long ? SWING.longRsi : SWING.shortRsi;
  if (r < lo || r > hi) return { side: null, reason: `سوينغ: RSI ${r.toFixed(0)} خارج النطاق` };
  if (long ? bar.close <= bar.open : bar.close >= bar.open) return { side: null, reason: "سوينغ: شمعة التأكيد عكسية" };
  const swing = long ? Math.min(...m15.slice(n - 8, n + 1).map((k) => k.low)) : Math.max(...m15.slice(n - 8, n + 1).map((k) => k.high));
  const slDist = Math.min(SWING.maxSl, Math.max(SWING.minSl, Math.abs(price - swing) + at * 0.2));
  // Nearest 1H level in our direction caps the target.
  const hiH = h1.slice(-48).map((k) => (long ? k.high : k.low)).filter((v) => (long ? v > price + 1 : v < price - 1));
  const level = hiH.length ? (long ? Math.min(...hiH) : Math.max(...hiH)) : NaN;
  let tpDist = Math.min(SWING.maxTp, slDist * 3);
  if (Number.isFinite(level)) tpDist = Math.min(tpDist, Math.abs(level - price) - 0.5);
  if (tpDist < SWING.minTp || tpDist / slDist < SWING.minRr) return { side: null, reason: "سوينغ: الهدف قريب من مقاومة — عائد ضعيف" };
  return {
    side: trend,
    stop: long ? price - slDist : price + slDist,
    target: long ? price + tpDist : price - tpDist,
    reason: `ترند الساعة ${long ? "صاعد" : "هابط"} + كسر هيكل 15د + ارتداد EMA21 | RSI ${r.toFixed(0)} ADX ${a.toFixed(0)}`,
  };
}

/** A position is a swing when its stop sits at least SWING.minSl - 0.5 points away (turbo stops are ≤3). */
export function isSwingPos(p: { price_open: number; sl: number }, entrySlDist?: number): boolean {
  const d = entrySlDist ?? (p.sl > 0 ? Math.abs(p.price_open - p.sl) : 0);
  return d >= SWING.minSl - 0.5;
}

/** Swing management: break-even at +4, then lock +4 once +8 is reached. */
export function swingManage(p: { type: "BUY" | "SELL"; price_open: number; sl: number }, price: number): "hold" | "BREAKEVEN" {
  const long = p.type === "BUY";
  const move = long ? price - p.price_open : p.price_open - price;
  const secured = p.sl > 0 && (long ? p.sl >= p.price_open : p.sl <= p.price_open);
  return !secured && move >= SWING.beUsdPts ? "BREAKEVEN" : "hold";
}
