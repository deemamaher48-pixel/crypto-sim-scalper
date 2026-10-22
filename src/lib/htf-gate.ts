// Higher-timeframe gate for TURBO: 1H and 4H (built from 1H bars) must not oppose the trade.
import { ema } from "@/lib/trading";

type Bar = { open?: number; high: number; low: number; close: number };

export function toH4(h1: Bar[]): Bar[] {
  const out: Bar[] = [];
  for (let i = h1.length % 4; i + 4 <= h1.length; i += 4) {
    const g = h1.slice(i, i + 4);
    out.push({ high: Math.max(...g.map((k) => k.high)), low: Math.min(...g.map((k) => k.low)), close: g[3]!.close });
  }
  return out;
}

function trend(bars: Bar[], fast: number, slow: number): "long" | "short" | null {
  const n = bars.length - 1;
  if (n < slow) return null;
  const cl = bars.map((k) => k.close);
  const f = ema(cl, fast)[n]!, s = ema(cl, slow)[n]!, c = cl[n]!;
  if (f > s && c > s) return "long";
  if (f < s && c < s) return "short";
  return null;
}

/** Blocks when both 1H and 4H oppose the side, or when 1H opposes and 4H is not supportive. */
export function htfGate(h1: Bar[], side: "long" | "short"): string | null {
  const t1 = trend(h1, 21, 50);
  const t4 = trend(toH4(h1), 9, 21);
  const opp = side === "long" ? "short" : "long";
  if (t1 === opp && t4 !== side) return side === "long" ? "فريم 1س/4س هابط — ممنوع الشراء" : "فريم 1س/4س صاعد — ممنوع البيع";
  if (t4 === opp && t1 !== side) return side === "long" ? "فريم 4س هابط — ممنوع الشراء" : "فريم 4س صاعد — ممنوع البيع";
  return null;
}
