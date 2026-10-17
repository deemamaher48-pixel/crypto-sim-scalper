// Smart VWAP & Momentum Scalping — pure rules (closed candles only). 5m = signal/execution, 15m = trend filter.
import { adx, atr, ema, macd, rsi, sma, vwap, PAPER_FEE, type Side } from "@/lib/trading";

export type Bar = { time: number; open: number; high: number; low: number; close: number; volume: number };

export const SMART = {
  minScore: 75,
  volMult: 1.4,
  spikeAtr: 2.5,
  slMinUsd: 1.5,
  slMaxUsd: 4,
  minBody: 0.6,
  maxVwapAtr: 2.5,
  cooldownBars: 3,
  barSec: 300,
  slAtr: 1.5,
  tp1Atr: 1.5,
  tp2Atr: 3,
  tp1Close: 0.6,
  timeStopBars: 5,
} as const;

export type SmartCheck = { key: string; label: string; weight: number; long: boolean; short: boolean };
export type SmartSignal = { side: Side | null; score: number; reason: string; checks: SmartCheck[]; atr: number; vwap: number };

/** Score both directions on the last closed 5m bar; a side needs ≥80% with VWAP-trend and liquidity both passing. */
export function smartSignal(c5: Bar[], c15: Bar[]): SmartSignal | null {
  const n = c5.length - 1;
  if (n < 40 || !c15.length) return null;
  const closes = c5.map((k) => k.close);
  const bar = c5[n]!;
  const e9 = ema(closes, 9), e21 = ema(closes, 21);
  const r = rsi(closes, 9);
  const m = macd(closes);
  const dx = adx(c5, 14).adx;
  const a = atr(c5, 14)[n]!;
  const v5 = vwap(c5), v15 = vwap(c15);
  const p15 = c15.at(-1)!.close;
  const volAvg = sma(c5.map((k) => k.volume), 20)[n - 1]!;
  const range = bar.high - bar.low;
  const body = range > 0 ? Math.abs(bar.close - bar.open) / range : 0;
  if (![e9[n], e21[n], r[n], r[n - 1], m.hist[n], m.hist[n - 1], a, v5, v15, volAvg].every(Number.isFinite)) return null;

  const liq = bar.volume > SMART.volMult * volAvg && body >= SMART.minBody;
  const adxOk = Number.isFinite(dx[n]) && dx[n]! > 22 && dx[n]! > dx[n - 1]!;
  const checks: SmartCheck[] = [
    { key: "trend", label: "الاتجاه VWAP + EMA 9/21", weight: 30,
      long: bar.close > v5 && p15 > v15 && e9[n]! > e21[n]!, short: bar.close < v5 && p15 < v15 && e9[n]! < e21[n]! },
    { key: "liq", label: "السيولة + جسم الشمعة", weight: 25, long: liq && bar.close > bar.open, short: liq && bar.close < bar.open },
    { key: "rsi", label: "RSI 9", weight: 20,
      long: r[n - 1]! < 55 && r[n]! >= 55 && r[n]! < 70, short: r[n - 1]! > 45 && r[n]! <= 45 && r[n]! > 30 },
    { key: "macd", label: "MACD هيستوغرام", weight: 15,
      long: m.hist[n]! > 0 && m.hist[n]! > m.hist[n - 1]!, short: m.hist[n]! < 0 && m.hist[n]! < m.hist[n - 1]! },
    { key: "adx", label: "ADX 14 > 22 صاعد", weight: 10, long: adxOk, short: adxOk },
  ];
  const score = (s: Side) => checks.reduce((t, c) => t + (c[s] ? c.weight : 0), 0);
  const ls = score("long"), ss = score("short");
  const side: Side = ls >= ss ? "long" : "short";
  const best = Math.max(ls, ss);
  const base = { score: best, checks, atr: a, vwap: v5 };
  const tag = side === "long" ? "Long" : "Short";
  if (!checks[0]![side]) return { ...base, side: null, reason: `يراقب — شرط اتجاه VWAP غير محقق (${best}%)` };
  if (!checks[1]![side]) return { ...base, side: null, reason: `يراقب — لا سيولة كافية أو شمعة ضعيفة (${best}%)` };
  if (best < SMART.minScore) return { ...base, side: null, reason: `يراقب — نقاط ${tag} ${best}% أقل من 75%` };
  if (range > SMART.spikeAtr * a)
    return { ...base, side: null, reason: "فلتر الأخبار — شمعة انفجارية أطول من 2.5×ATR" };
  if (Math.abs(bar.close - v5) > SMART.maxVwapAtr * a)
    return { ...base, side: null, reason: "منع المطاردة — السعر بعيد عن VWAP أكثر من 2.5×ATR" };
  return { ...base, side, reason: `Smart VWAP ${tag} — نقاط ${best}%` };
}

/** True while a stop-loss within the last 3 bars blocks new entries. */
export function inCooldown(lastStopAt: number | null, now: number) {
  return lastStopAt != null && now - lastStopAt < SMART.cooldownBars * SMART.barSec * 1000;
}

/** Gold daily close/reopen window 23:00–01:00 UTC: no new entries (wide spread). */
export function inRolloverWindow(ms: number) {
  const h = new Date(ms).getUTCHours();
  return h >= 23 || h < 1;
}

/** SL 1.5×ATR (clamped to $1.5–$4 for gold only), TP1 1.5×ATR, TP2 3×ATR. */
export function smartBracket(side: Side, entry: number, a: number, gold = true) {
  const d = side === "long" ? 1 : -1;
  const raw = SMART.slAtr * a;
  const sl = gold ? Math.min(Math.max(raw, SMART.slMinUsd), SMART.slMaxUsd) : raw;
  return { stop: entry - d * sl, tp1: entry + d * SMART.tp1Atr * a, target: entry + d * SMART.tp2Atr * a };
}

/** Breakeven stop after TP1: entry plus the round-trip spread cost. */
export function breakevenStop(side: Side, entry: number) {
  const c = entry * PAPER_FEE * 2;
  return side === "long" ? entry + c : entry - c;
}

export type SmartTrade = { side: Side; entry: number; tp1: number; tp1Hit: boolean; best: number; openedAt: string };
export type SmartExit = "time_stop" | "vwap_break" | "ema_cross" | "trailing";

/** Candle-close exits for an open trade (call after each closed 5m bar). */
export function smartCandleExit(t: SmartTrade, c5: Bar[], nowMs: number): SmartExit | null {
  const n = c5.length - 1;
  if (n < 25) return null;
  const d = t.side === "long" ? 1 : -1;
  const closes = c5.map((k) => k.close);
  const e9 = ema(closes, 9), e21 = ema(closes, 21);
  const bar = c5[n]!;
  if (t.tp1Hit && d * (bar.close - e9[n]!) < 0) return "trailing";
  if (d * (e9[n - 1]! - e21[n - 1]!) >= 0 && d * (e9[n]! - e21[n]!) < 0) return "ema_cross";
  const volAvg = sma(c5.map((k) => k.volume), 20)[n - 1]!;
  if (d * (bar.close - vwap(c5)) < 0 && bar.volume > volAvg) return "vwap_break";
  const bars = (nowMs - Date.parse(t.openedAt)) / (SMART.barSec * 1000);
  if (!t.tp1Hit && bars >= SMART.timeStopBars && d * (t.best - t.entry) < 0.5 * Math.abs(t.tp1 - t.entry)) return "time_stop";
  return null;
}
