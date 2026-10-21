import { ema, rsi } from "@/lib/trading";

// Pure open-position manager for MT5 gold (broker snapshot is the truth).
// Move in points is derived from broker profit: XAUUSD 1.00 lot = $100 per point.
export type MgrPos = { ticket: number; type: "BUY" | "SELL"; volume: number; price_open: number; sl: number; tp: number; profit: number };
export type MgrBar = { open: number; high: number; low: number; close: number };
export type MgrDecision = { action: "hold" | "BREAKEVEN" | "CLOSE_PARTIAL" | "CLOSE"; reason: string; lot?: number };
export const MGR = { bePts: 1.5, partialPts: 2.0, exitMinPts: 0.8, lossCutFrac: 0.7, pointValuePerLot: 100 };

export function movePts(p: MgrPos) {
  return p.volume > 0 ? p.profit / (p.volume * MGR.pointValuePerLot) : 0;
}

export function manageDecision(p: MgrPos, bars: MgrBar[], partialDone: boolean): MgrDecision {
  const long = p.type === "BUY";
  const move = movePts(p);
  const slDist = p.sl > 0 ? Math.abs(p.price_open - p.sl) : 0;
  const secured = p.sl > 0 && (long ? p.sl >= p.price_open : p.sl <= p.price_open);
  const closes = bars.map(b => b.close);
  const e9 = ema(closes, 9), e21 = ema(closes, 21), r = rsi(closes, 9);
  const n = closes.length - 1, last = bars[n];
  let reversal = false, against = false;
  if (n >= 22 && last) {
    const range = last.high - last.low, body = Math.abs(last.close - last.open);
    const strongOpp = range > 0 && body / range >= 0.6 && (long ? last.close < last.open : last.close > last.open);
    const exhausted = long ? r[n - 1]! >= 75 : r[n - 1]! <= 25;
    against = long ? e9[n]! < e21[n]! : e9[n]! > e21[n]!;
    reversal = strongOpp && (exhausted || against);
  }
  if (move >= MGR.exitMinPts && reversal) return { action: "CLOSE", reason: "reversal_lock_profit" };
  if (slDist > 0 && move <= -MGR.lossCutFrac * slDist && against) return { action: "CLOSE", reason: "trend_flipped_cut_loss" };
  if (!partialDone && move >= MGR.partialPts && p.volume >= 0.02) return { action: "CLOSE_PARTIAL", reason: "take_half", lot: +(Math.floor(p.volume * 50) / 100).toFixed(2) };
  if (!secured && move >= MGR.bePts) return { action: "BREAKEVEN", reason: "secure_entry" };
  return { action: "hold", reason: "ok" };
}
