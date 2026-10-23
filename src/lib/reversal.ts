// Momentum-reversal entry (user rule): a firm 5m candle aligned with 1H = quick scalp;
// plus a firm 15m body aligned with 4H = strong reversal. Pure, testable.
import { toH4 } from "@/lib/htf-gate";
import { ema } from "@/lib/trading";

type Bar = { open: number; high: number; low: number; close: number };
export type Reversal = { side: "long" | "short"; strong: boolean; slPts: number; tpPts: number; score: number; reason: string } | null;

/** Firm candle: body ≥ 60% of range, closes beyond the previous bar's extreme. */
export function firm(bars: Bar[], minBody = 0.6): "long" | "short" | null {
  const k = bars.at(-1), p = bars.at(-2);
  if (!k || !p) return null;
  const range = k.high - k.low, body = Math.abs(k.close - k.open);
  if (range <= 0 || body / range < minBody) return null;
  if (k.close > k.open && k.close > p.high) return "long";
  if (k.close < k.open && k.close < p.low) return "short";
  return null;
}

/** Wilder RSI of the last close; null when not enough data. */
export function rsiLast(c: number[], n = 14): number | null {
  if (c.length <= n) return null;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = c[i]! - c[i - 1]!; d > 0 ? (g += d) : (l -= d); }
  g /= n; l /= n;
  for (let i = n + 1; i < c.length; i++) {
    const d = c[i]! - c[i - 1]!;
    g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n;
  }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}

function tr(bars: { close: number }[], f: number, s: number): "long" | "short" | null {
  const n = bars.length - 1;
  if (n < s) return null;
  const c = bars.map((k) => k.close), a = ema(c, f)[n]!, b = ema(c, s)[n]!;
  return a > b && c[n]! > b ? "long" : a < b && c[n]! < b ? "short" : null;
}

export function reversalSignal(m5: Bar[], m15: Bar[], h1: Bar[]): Reversal {
  const side = firm(m5);
  if (!side) return null;
  const opp = side === "long" ? "short" : "long";
  // Anti-chase: never sell into an oversold low / buy an overbought top.
  const cl = m5.map((k) => k.close);
  const r = rsiLast(cl, 14);
  if (r != null && ((side === "short" && r < 35) || (side === "long" && r > 65))) return null;
  // Anti-chase: skip when price is stretched far from 5m EMA21 (> 2× average range).
  if (m5.length >= 22) {
    const e21 = ema(cl, 21).at(-1)!, last = m5.slice(-14);
    const avg = last.reduce((s, k) => s + (k.high - k.low), 0) / last.length;
    if (avg > 0 && Math.abs(cl.at(-1)! - e21) > 2 * avg) return null;
  }
  const t1 = tr(h1, 21, 50);
  if (t1 === opp) return null; // 5m must agree with (or at least not oppose) 1H
  const t4 = tr(toH4(h1), 9, 21);
  const strong = firm(m15, 0.55) === side && t4 !== opp;
  const word = side === "long" ? "شراء" : "بيع";
  return strong
    ? { side, strong, slPts: 3, tpPts: 4.5, score: 3, reason: `🔄 انعكاس قوي ${word}: شمعة 5د + جسم 15د ثابت مع 1س/4س` }
    : { side, strong, slPts: 2.5, tpPts: 3, score: 2, reason: `🔄 انعكاس سكالب ${word}: شمعة 5د ثابتة مع 1س` };
}
