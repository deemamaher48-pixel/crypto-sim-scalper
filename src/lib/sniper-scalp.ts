// XAUUSD 1m Sniper Scalping (Zero-Risk Focus) — pure rules on closed candles. 1m = execution, 5m = mandatory trend filter.
import { adx, atr, ema, macd, rsi, sma, vwap, PAPER_FEE, type Side } from "@/lib/trading";
import type { Bar, SmartSignal, SmartCheck } from "@/lib/smart-scalp";

export const SNIPER = {
  minScore: 75,
  volMult: 1.3,
  minBody: 0.55,
  maxRangeAtr: 2.2,
  maxVwapAtr: 2,
  beAtr: 1.0,
  slAtr: 1.5,
  slMinUsd: 0.8,
  slMaxUsd: 2.2,
  tp1Atr: 1.2,
  tp2Atr: 2.5,
  tp1Close: 0.7,
  timeStopBars: 3,
  cooldownBars: 2,
  barSec: 60,
  breakerLosses: 3,
  breakerMs: 30 * 60 * 1000,
} as const;

/** Score the last closed 1m bar; needs ≥85% with trend (both frames) and liquidity mandatory. */
export function sniperSignal(c1: Bar[], c5: Bar[]): SmartSignal | null {
  const n = c1.length - 1, m5 = c5.length - 1;
  if (n < 40 || m5 < 21) return null;
  const closes = c1.map((k) => k.close), closes5 = c5.map((k) => k.close);
  const bar = c1[n]!;
  const e9 = ema(closes, 9), e21 = ema(closes, 21);
  const f9 = ema(closes5, 9), f21 = ema(closes5, 21);
  const r = rsi(closes, 7);
  const m = macd(closes);
  const dx = adx(c1, 14).adx;
  const a = atr(c1, 14)[n]!;
  const v1 = vwap(c1), v5 = vwap(c5);
  const p5 = c5[m5]!.close;
  const volAvg = sma(c1.map((k) => k.volume), 20)[n - 1]!;
  const range = bar.high - bar.low;
  const body = range > 0 ? Math.abs(bar.close - bar.open) / range : 0;
  const nums = [e9[n], e21[n], f9[m5], f21[m5], r[n], r[n - 1], m.hist[n], m.hist[n - 1], m.hist[n - 2], a, v1, v5, volAvg];
  if (!nums.every(Number.isFinite)) return null;

  const liq = bar.volume >= SNIPER.volMult * volAvg && body >= SNIPER.minBody && range <= SNIPER.maxRangeAtr * a;
  const h = m.hist;
  const adxOk = Number.isFinite(dx[n]) && dx[n]! > 25 && dx[n]! > dx[n - 1]!;
  const checks: SmartCheck[] = [
    { key: "trend", label: "الاتجاه VWAP + EMA 9/21 (1m و5m)", weight: 30,
      long: bar.close > v1 && p5 > v5 && e9[n]! > e21[n]! && f9[m5]! > f21[m5]!,
      short: bar.close < v1 && p5 < v5 && e9[n]! < e21[n]! && f9[m5]! < f21[m5]! },
    { key: "liq", label: "فوليوم 1.8x + جسم 70%", weight: 25, long: liq && bar.close > bar.open, short: liq && bar.close < bar.open },
    { key: "rsi", label: "RSI 7", weight: 20,
      long: r[n - 1]! < 58 && r[n]! >= 58 && r[n]! < 72, short: r[n - 1]! > 42 && r[n]! <= 42 && r[n]! > 28 },
    { key: "macd", label: "MACD تسارع شمعتين", weight: 15,
      long: h[n]! > 0 && h[n]! > h[n - 1]! && h[n - 1]! > h[n - 2]!, short: h[n]! < 0 && h[n]! < h[n - 1]! && h[n - 1]! < h[n - 2]! },
    { key: "adx", label: "ADX 14 > 25 صاعد", weight: 10, long: adxOk, short: adxOk },
  ];
  const score = (s: Side) => checks.reduce((t, c) => t + (c[s] ? c.weight : 0), 0);
  const ls = score("long"), ss = score("short");
  const side: Side = ls >= ss ? "long" : "short";
  const best = Math.max(ls, ss);
  const base = { score: best, checks, atr: a, vwap: v1 };
  const tag = side === "long" ? "Long" : "Short";
  if (!checks[0]![side]) return { ...base, side: null, reason: `قنص الدقيقة — الاتجاه غير متطابق على الفريمين (${best}%)` };
  if (!checks[1]![side]) return { ...base, side: null, reason: `قنص الدقيقة — لا انفجار سيولة أو شمعة غير صافية (${best}%)` };
  if (best < SNIPER.minScore) return { ...base, side: null, reason: `قنص الدقيقة — نقاط ${tag} ${best}% أقل من 75%` };
  if (Math.abs(bar.close - v1) > SNIPER.maxVwapAtr * a)
    return { ...base, side: null, reason: "منع المطاردة — السعر بعيد عن VWAP أكثر من 2×ATR" };
  return { ...base, side, reason: `قنص الدقيقة ${tag} — نقاط ${best}%` };
}

/** SL 1.5×ATR (gold clamp $0.8–$2.2), TP1 1.2×ATR, TP2 2.5×ATR. */
export function sniperBracket(side: Side, entry: number, a: number, gold = true) {
  const d = side === "long" ? 1 : -1;
  const raw = SNIPER.slAtr * a;
  const sl = gold ? Math.min(Math.max(raw, SNIPER.slMinUsd), SNIPER.slMaxUsd) : raw;
  return { stop: entry - d * sl, tp1: entry + d * SNIPER.tp1Atr * a, target: entry + d * SNIPER.tp2Atr * a };
}

/** Fast breakeven: once price moves 0.8×ATR in favour, return entry + round-trip spread; otherwise null. */
export function fastBreakeven(side: Side, entry: number, price: number, a: number) {
  const d = side === "long" ? 1 : -1;
  if (d * (price - entry) < SNIPER.beAtr * a - 1e-9) return null;
  return entry + d * entry * PAPER_FEE * 2;
}

export function sniperCooldown(lastStopAt: number | null, now: number) {
  return lastStopAt != null && now - lastStopAt < SNIPER.cooldownBars * SNIPER.barSec * 1000;
}

/** Circuit breaker trips when the most recent N closed sniper trades were all losses. */
export function breakerTripped(recentPnls: number[]) {
  return recentPnls.length >= SNIPER.breakerLosses && recentPnls.slice(0, SNIPER.breakerLosses).every((p) => p < 0);
}

export type SniperTrade = { side: Side; entry: number; tp1: number; tp1Hit: boolean; best: number; openedAt: string };

/** Candle-close exits on 1m: trailing behind EMA 9 after TP1, momentum break, 3-bar time-stop. */
export function sniperCandleExit(t: SniperTrade, c1: Bar[], nowMs: number): "trailing" | "ema_cross" | "time_stop" | null {
  const n = c1.length - 1;
  if (n < 25) return null;
  const d = t.side === "long" ? 1 : -1;
  const e9 = ema(c1.map((k) => k.close), 9);
  const bar = c1[n]!;
  const against = d * (bar.close - e9[n]!) < 0;
  if (t.tp1Hit && against) return "trailing";
  const volAvg = sma(c1.map((k) => k.volume), 20)[n - 1]!;
  if (against && bar.volume > volAvg) return "ema_cross";
  const bars = (nowMs - Date.parse(t.openedAt)) / (SNIPER.barSec * 1000);
  if (!t.tp1Hit && bars >= SNIPER.timeStopBars && d * (t.best - t.entry) < 0.5 * Math.abs(t.tp1 - t.entry)) return "time_stop";
  return null;
}
