import { ema, rsi } from "@/lib/trading";

// Pure open-position manager for MT5 gold (broker snapshot is the truth).
// Move in points is derived from broker profit: XAUUSD 1.00 lot = $100 per point.
export type MgrPos = { ticket: number; type: "BUY" | "SELL"; volume: number; price_open: number; sl: number; tp: number; profit: number };
export type MgrBar = { open: number; high: number; low: number; close: number };
export type MgrDecision = { action: "hold" | "BREAKEVEN" | "CLOSE_PARTIAL" | "CLOSE"; reason: string; lot?: number };
export const MGR = { bePts: 2.5, graceSec: 120, stallFrac: 0.35, stallMaxPts: 0.4, partialPts: 2.0, exitMinPts: 1.5, lossCutFrac: 0.7, pointValuePerLot: 100 };

export function movePts(p: MgrPos) {
  return p.volume > 0 ? p.profit / (p.volume * MGR.pointValuePerLot) : 0;
}

export function manageDecision(p: MgrPos, bars: MgrBar[], partialDone: boolean, ageSec = Infinity): MgrDecision {
  // Grace period: the broker hard SL protects the trade; no smart exits while it breathes.
  if (ageSec < MGR.graceSec) return { action: "hold", reason: "grace" };
  const long = p.type === "BUY";
  const move = movePts(p);
  const slDist = p.sl > 0 ? Math.abs(p.price_open - p.sl) : 0;
  const secured = p.sl > 0 && (long ? p.sl >= p.price_open : p.sl <= p.price_open);
  const closes = bars.map(b => b.close);
  const e9 = ema(closes, 9), e21 = ema(closes, 21), r = rsi(closes, 9);
  const n = closes.length - 1, last = bars[n];
  let reversal = false, against = false, flip = false, stall = false;
  if (n >= 22 && last) {
    const range = last.high - last.low, body = Math.abs(last.close - last.open);
    const strongOpp = range > 0 && body / range >= 0.6 && (long ? last.close < last.open : last.close > last.open);
    const exhausted = long ? r[n - 1]! >= 75 : r[n - 1]! <= 25;
    against = long ? e9[n]! < e21[n]! : e9[n]! > e21[n]!;
    reversal = strongOpp && (exhausted || against);
    // Momentum flip: strong opposite candle closing through EMA9 against us.
    flip = range > 0 && body / range >= 0.5 && (long ? last.close < last.open && last.close < e9[n]! : last.close > last.open && last.close > e9[n]!);
    // Stall: last 3 candles much smaller than the recent average — momentum died.
    const rng = (b: MgrBar) => b.high - b.low;
    const avg20 = bars.slice(-20).reduce((a, b) => a + rng(b), 0) / 20;
    const avg3 = bars.slice(-3).reduce((a, b) => a + rng(b), 0) / 3;
    stall = avg20 > 0 && avg3 < MGR.stallFrac * avg20;
  }
  if (move >= MGR.exitMinPts && reversal) return { action: "CLOSE", reason: "reversal_lock_profit" };
  if (slDist > 0 && move <= -MGR.lossCutFrac * slDist && against) return { action: "CLOSE", reason: "trend_flipped_cut_loss" };
  if (move < 0 && flip) return { action: "CLOSE", reason: "momentum_flip_cut" };
  if (stall && move >= -0.2 && move <= MGR.stallMaxPts) return { action: "CLOSE", reason: "stall_exit" };
  // Smart TP: close to target but momentum fading (stall, flip or RSI cooling) → take profit now.
  const tpDist = p.tp > 0 ? Math.abs(p.tp - p.price_open) : 0;
  if (tpDist > 0 && n >= 22 && move >= 0.6 * tpDist) {
    const cooling = long ? r[n]! < r[n - 1]! && r[n]! < 60 : r[n]! > r[n - 1]! && r[n]! > 40;
    if (stall || flip || (cooling && against)) return { action: "CLOSE", reason: "tp_weak_take" };
  }
  if (!partialDone && move >= MGR.partialPts && p.volume >= 0.02) return { action: "CLOSE_PARTIAL", reason: "take_half", lot: +(Math.floor(p.volume * 50) / 100).toFixed(2) };
  if (!secured && move >= MGR.bePts) return { action: "BREAKEVEN", reason: "secure_entry" };
  return { action: "hold", reason: "ok" };
}
