// News volatility window for gold: scheduled US releases (UTC weekdays) + live 1m spike detection.
// pre (5 min before) and shock (first 3 min) block entries; post (next 30 min) allows max 2 AI-reviewed turbo trades.
import { atr } from "@/lib/trading";
import type { Bar } from "@/lib/smart-scalp";

export const NEWS = { times: ["12:30", "14:00", "18:00"], preMin: 5, shockMin: 3, postMin: 30, spikeAtr: 3, maxTrades: 2 } as const;
export type NewsPhase = { phase: "pre" | "shock" | "post"; start: number; why: string } | null;

const MIN = 60_000;

export function scheduledPhase(ms: number): NewsPhase {
  const d = new Date(ms), wd = d.getUTCDay();
  if (wd === 0 || wd === 6) return null;
  for (const t of NEWS.times) {
    const [h, m] = t.split(":").map(Number);
    const at = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h!, m!);
    const dt = ms - at;
    if (dt >= -NEWS.preMin * MIN && dt < 0) return { phase: "pre", start: at, why: `خبر ${t} UTC` };
    if (dt >= 0 && dt < NEWS.shockMin * MIN) return { phase: "shock", start: at, why: `خبر ${t} UTC` };
    if (dt >= NEWS.shockMin * MIN && dt < NEWS.postMin * MIN) return { phase: "post", start: at, why: `خبر ${t} UTC` };
  }
  return null;
}

/** Latest closed 1m bar whose range is ≥ spikeAtr × ATR of the bars before it. */
export function spikePhase(bars: Bar[]): NewsPhase {
  const n = bars.length - 1;
  if (n < 50) return null;
  const a = atr(bars, 14);
  for (let i = n; i > n - NEWS.postMin && i > 20; i--) {
    const base = a[i - 1]!, b = bars[i]!;
    if (!Number.isFinite(base) || base <= 0) continue;
    if (b.high - b.low >= NEWS.spikeAtr * base) {
      const age = n - i;
      const start = b.time * 1000;
      return { phase: age < NEWS.shockMin ? "shock" : "post", start, why: `شمعة انفجار ${(b.high - b.low).toFixed(1)}$` };
    }
  }
  return null;
}

/** Scheduled news wins; otherwise a live spike. */
export function newsPhase(ms: number, bars: Bar[]): NewsPhase {
  return scheduledPhase(ms) ?? spikePhase(bars);
}
