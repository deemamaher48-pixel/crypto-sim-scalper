// Smart SL/TP for 1m gold scalps: user points are the MAXIMUM; the real distances come from the chart.
// SL sits just beyond the recent swing (last 3 closed bars), never tighter than half the ATR.
// TP stops just before the nearest swing high/low in the last 20 bars; trade is skipped when that leaves poor reward.
import { type Side } from "@/lib/trading";
import type { Bar } from "@/lib/smart-scalp";

export const SMART = { minSl: 0.5, minTp: 1.5, buffer: 0.15, tpBuffer: 0.1, swingBars: 3, levelBars: 20, atrLen: 14, minRR: 1.5 } as const;

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
  if (sl > maxSl) sl = maxSl; // cap at the user's max

  const levels = bars.slice(-SMART.levelBars).map((b) => (long ? b.high : b.low)).filter((x) => (long ? x > entry : x < entry));
  let tp = maxTp, why = `وقف تحت ${long ? "القاع" : "القمة"} القريب`;
  if (levels.length) {
    const near = long ? Math.min(...levels) : Math.max(...levels);
    const dist = Math.abs(near - entry) - SMART.tpBuffer;
    if (dist < tp) { tp = dist; why += ` | هدف قبل ${long ? "مقاومة" : "دعم"} ${near.toFixed(2)}`; }
  }
  tp = r2(tp); sl = r2(sl);
  if (tp < SMART.minTp || tp < r2(sl * SMART.minRR)) return { ok: false, why: `${long ? "مقاومة" : "دعم"} قريب جداً — عائد ضعيف` };
  sl = r2(sl); tp = r2(tp);
  return { ok: true, stop: r2(entry - d * sl), target: r2(entry + d * tp), slPts: sl, tpPts: tp, why };
}
