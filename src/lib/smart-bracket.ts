// Smart SL/TP for 1m gold scalps: user points are the MAXIMUM; the real distances come from the chart.
// SL sits just beyond the recent swing (last 3 closed bars), never tighter than half the ATR.
// TP stops just before the nearest swing high/low in the last 20 bars; trade is skipped when that leaves poor reward.
import { type Side } from "@/lib/trading";
import type { Bar } from "@/lib/smart-scalp";

export const SMART = { minSl: 1.5, minTp: 2.5, buffer: 0.15, tpBuffer: 0.1, swingBars: 3, levelBars: 20, atrLen: 14, minRR: 1.3, minLevelDist: 0.8 } as const;

export type SmartBracket =
  | { ok: true; stop: number; target: number; slPts: number; tpPts: number; why: string }
  | { ok: false; why: string };

function atr(bars: Bar[], len: number) {
  const s = bars.slice(-len - 1);
  let sum = 0, n = 0;
  for (let i = 1; i < s.length; i++) {
    const b = s[i]!, p = s[i - 1]!.close;
    sum += Math.max(b.high - b.low, Math.abs(b.high - p), Math.abs(b.low - p)); n++;
  }
  return n ? sum / n : 0;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export function smartBracket(side: Side, entry: number, bars: Bar[], maxSl: number, maxTp: number): SmartBracket {
  if (bars.length < SMART.levelBars + 1) return { ok: false, why: "بيانات غير كافية" };
  const long = side === "long", d = long ? 1 : -1;
  const a = atr(bars, SMART.atrLen);
  const swing = bars.slice(-SMART.swingBars);
  const ext = long ? Math.min(...swing.map((b) => b.low)) : Math.max(...swing.map((b) => b.high));
  const swingDist = long ? entry - ext : ext - entry;
  let sl = Math.max(swingDist + SMART.buffer, a * 0.5, SMART.minSl);
  if (sl > Math.max(maxSl, SMART.minSl)) sl = Math.max(maxSl, SMART.minSl); // cap at the user's max

  // Only real swing pivots count as levels; tiny wicks right next to entry are ignored.
  const win = bars.slice(-SMART.levelBars);
  const levels = win
    .filter((b, i) => i > 0 && i < win.length - 1 && (long ? b.high >= win[i - 1]!.high && b.high >= win[i + 1]!.high : b.low <= win[i - 1]!.low && b.low <= win[i + 1]!.low))
    .map((b) => (long ? b.high : b.low))
    .filter((x) => (long ? x - entry : entry - x) >= SMART.minLevelDist);
  // Adaptive target: in a trend (last 10 bars moved ≥ 3×ATR our way) aim for the user max; when calm, ~2.5×ATR (min 2 pts).
  const trendMove = (bars[bars.length - 1]!.close - bars[bars.length - 11]!.close) * d;
  const trending = a > 0 && trendMove >= 3 * a;
  let tp = trending ? maxTp : Math.min(maxTp, Math.max(SMART.minTp, a * 2.5));
  let why = `وقف تحت ${long ? "القاع" : "القمة"} القريب | ${trending ? "ترند — هدف كامل" : "سوق هادي — هدف قريب"}`;
  if (levels.length) {
    const near = long ? Math.min(...levels) : Math.max(...levels);
    const dist = Math.abs(near - entry) - SMART.tpBuffer;
    if (dist < tp) { tp = dist; why += ` | هدف قبل ${long ? "مقاومة" : "دعم"} ${near.toFixed(2)}`; }
  }
  tp = r2(tp); sl = r2(sl);
  // Poor reward: tighten the stop (never below the ATR floor) before giving up on the trade.
  if (tp >= SMART.minTp && tp < r2(sl * SMART.minRR)) {
    const tight = r2(tp / SMART.minRR);
    if (tight >= SMART.minSl) { sl = tight; why += " | وقف مضغوط"; }
  }
  if (tp < SMART.minTp || tp < r2(sl * SMART.minRR)) return { ok: false, why: `${long ? "مقاومة" : "دعم"} قريب جداً — عائد ضعيف` };
  return { ok: true, stop: r2(entry - d * sl), target: r2(entry + d * tp), slPts: sl, tpPts: tp, why };
}
