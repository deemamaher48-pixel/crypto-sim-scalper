// Session-aware gold engine (X-DIAB): UTC sessions, daily pivot compass, Asia range, and a flexible TURBO signal.
// Pure functions only — the server feeds Twelve Data bars; broker fill re-anchors SL/TP.
import { adx, atr, ema, rsi, type Side } from "@/lib/trading";
import type { Bar } from "@/lib/smart-scalp";

export type Session = "ASIA" | "LONDON_OPEN" | "LONDON_MID" | "NY_OVERLAP" | "NY_LATE" | "ROLLOVER";
export type TimedBar = Bar & { time: number };
export type Pivot = { P: number; R1: number; S1: number; R2: number; S2: number };

export const ENGINE = { chaseAtr: 2.8, pullAtr: 0.35, minAdx: 15, minBody: 0.5, slMin: 1.2, slMax: 3.0, slPad: 0.3, tpAsia: 1.2, tpMain: 1.8, beNy: 2.5, beMain: 2.5, asiaBoxAtr: 2, asiaEdge: 0.2 } as const;

export function sessionAt(ms: number): Session {
  const h = new Date(ms).getUTCHours();
  if (h < 7) return "ASIA";
  if (h < 10) return "LONDON_OPEN";
  if (h < 13) return "LONDON_MID";
  if (h < 16) return "NY_OVERLAP";
  if (h < 20) return "NY_LATE";
  return "ROLLOVER";
}

export const SESSION_AR: Record<Session, string> = {
  ASIA: "آسيا", LONDON_OPEN: "افتتاح لندن", LONDON_MID: "لندن", NY_OVERLAP: "تداخل نيويورك", NY_LATE: "نيويورك المتأخرة", ROLLOVER: "قبل الإغلاق",
};

/** Classic daily pivot from the previous UTC day, built from hourly bars (time in ms). */
export function dailyPivot(h1: TimedBar[], nowMs: number): Pivot | null {
  const today = new Date(nowMs); today.setUTCHours(0, 0, 0, 0);
  const start = today.getTime() - 86_400_000, end = today.getTime();
  let prev = h1.filter((k) => k.time >= start && k.time < end);
  // Weekend/holiday: fall back to the last full day that has bars.
  if (prev.length < 6) {
    const before = h1.filter((k) => k.time < end);
    if (!before.length) return null;
    const d = new Date(before[before.length - 1]!.time); d.setUTCHours(0, 0, 0, 0);
    prev = before.filter((k) => k.time >= d.getTime());
    if (prev.length < 6) return null;
  }
  const h = Math.max(...prev.map((k) => k.high)), l = Math.min(...prev.map((k) => k.low)), c = prev[prev.length - 1]!.close;
  const P = (h + l + c) / 3;
  return { P, R1: 2 * P - l, S1: 2 * P - h, R2: P + (h - l), S2: P - (h - l) };
}

/** Today's Asia range (00:00–07:00 UTC) from 15m bars; needs ≥4 bars. */
export function asianRange(m15: TimedBar[], nowMs: number): { high: number; low: number } | null {
  const d = new Date(nowMs); d.setUTCHours(0, 0, 0, 0);
  const s = m15.filter((k) => k.time >= d.getTime() && k.time < d.getTime() + 7 * 3_600_000);
  if (s.length < 4) return null;
  return { high: Math.max(...s.map((k) => k.high)), low: Math.min(...s.map((k) => k.low)) };
}

/** Pivot bias from the last closed 5m bar: above P = long only, below = short only. */
export function pivotBias(m5Close: number, p: Pivot): Side {
  return m5Close > p.P ? "long" : "short";
}

export type EngineSignal = { side: Side; score: 1 | 2 | 3; slPts: number; tpPts: number; tag: string; reason: string } | { side: null; reason: string };

/**
 * Flexible TURBO: three paths so the bot does not freeze.
 * ASIA: pivot + EMA pullback (no ADX). LONDON_OPEN: Asia range breakout (score 3). Others: trend pullback or micro-breakout with ADX ≥ 18.
 */
export function engineTurbo(c1: Bar[], session: Session, bias: Side, asia: { high: number; low: number } | null, swingDir: Side | null = null): EngineSignal {
  if (session === "ROLLOVER") return { side: null, reason: "قبل الإغلاق — لا صفقات جديدة" };
  const n = c1.length - 1;
  if (n < 55) return { side: null, reason: "بيانات غير كافية" };
  if (swingDir && swingDir !== bias) return { side: null, reason: "البيفوت عكس صفقة السوينغ" };
  const cl = c1.map((k) => k.close);
  const c = c1[n]!, a = atr(c1, 14)[n]!, r = rsi(cl, 14)[n]!, x = adx(c1, 14).adx[n]!;
  const e9 = ema(cl, 9)[n]!, e21 = ema(cl, 21)[n]!, e50 = ema(cl, 50)[n]!;
  if (![a, r, e9, e21, e50].every(Number.isFinite) || a <= 0) return { side: null, reason: "مؤشرات غير جاهزة" };
  const size = c.high - c.low;
  if (size > ENGINE.chaseAtr * a) return { side: null, reason: "شمعة انفجارية — منع المطاردة" };
  const bull = c.close > c.open && c.close - c.open >= size * ENGINE.minBody;
  const bear = c.close < c.open && c.open - c.close >= size * ENGINE.minBody;
  const up = e21 > e50, down = e21 < e50;
  const pullBuy = c.low <= e9 + a * ENGINE.pullAtr && c.close > e21;
  const pullSell = c.high >= e9 - a * ENGINE.pullAtr && c.close < e21;
  const prior = c1.slice(n - 4, n);
  const microUp = c.close > Math.max(...prior.map((k) => k.high)) && r < 70;
  const microDn = c.close < Math.min(...prior.map((k) => k.low)) && r > 30;
  const pick = (side: Side, score: 1 | 2 | 3, tag: string, why: string): EngineSignal => {
    const lows = c1.slice(n - 7, n).map((k) => k.low), highs = c1.slice(n - 7, n).map((k) => k.high);
    const raw = side === "long" ? c.close - Math.min(...lows) + a * ENGINE.slPad : Math.max(...highs) - c.close + a * ENGINE.slPad;
    const slPts = +Math.max(ENGINE.slMin, Math.min(ENGINE.slMax, raw)).toFixed(2);
    const tpPts = +(slPts * (session === "ASIA" ? ENGINE.tpAsia : ENGINE.tpMain)).toFixed(2);
    return { side, score, slPts, tpPts, tag, reason: `${why} | ${SESSION_AR[session]} | RSI ${r.toFixed(0)}` };
  };
  if (session === "ASIA") {
    if (bias === "long" && up && pullBuy && bull && r < 68) return pick("long", 1, "TA", "ارتداد EMA فوق البيفوت");
    if (bias === "short" && down && pullSell && bear && r > 32) return pick("short", 1, "TA", "ارتداد EMA تحت البيفوت");
    // Range fade: Asia gold mostly ranges — buy the floor, sell the ceiling (needs a real box ≥ 2 ATR).
    if (asia && asia.high - asia.low >= ENGINE.asiaBoxAtr * a) {
      const w = asia.high - asia.low, edge = w * ENGINE.asiaEdge;
      if (c.low <= asia.low + edge && bull && r < 45 && c.close > asia.low) return pick("long", 1, "TR", "ارتداد من قاع نطاق آسيا");
      if (c.high >= asia.high - edge && bear && r > 55 && c.close < asia.high) return pick("short", 1, "TR", "ارتداد من قمة نطاق آسيا");
    }
    return { side: null, reason: `آسيا: ننتظر ارتداد من حدود النطاق أو مع الترند` };
  }
  if (session === "LONDON_OPEN" && asia) {
    if (bias === "long" && c.close > asia.high && bull && r < 75) return pick("long", 3, "TL", "كسر قمة آسيا");
    if (bias === "short" && c.close < asia.low && bear && r > 25) return pick("short", 3, "TL", "كسر قاع آسيا");
  }
  if (!(x >= ENGINE.minAdx)) return { side: null, reason: `ADX ضعيف (${Number.isFinite(x) ? x.toFixed(0) : "-"})` };
  const strong = x > 25 && (session === "NY_OVERLAP" || session === "LONDON_OPEN") ? 3 : 2;
  if (bias === "long" && up && (pullBuy || microUp) && bull) return pick("long", strong, "TT", microUp ? "كسر قمة مصغر مع الترند" : "تصحيح مرن مع الترند");
  if (bias === "short" && down && (pullSell || microDn) && bear) return pick("short", strong, "TT", microDn ? "كسر قاع مصغر مع الترند" : "تصحيح مرن مع الترند");
  if (bias === "long" ? !up : !down) return { side: null, reason: `البيفوت ${bias === "long" ? "شراء" : "بيع"} والترند الدقيقة عكسه` };
  return { side: null, reason: "ننتظر تصحيح أو كسر مع الترند" };
}

/** Lot by score: 1→0.01, 2→0.02, 3→0.03; base lot only while another position is unsecured. */
export function scoreLot(base: number, score: number, otherUnsecured: boolean): number {
  if (otherUnsecured) return base;
  const lot = score >= 3 ? 0.03 : score === 2 ? 0.02 : 0.01;
  return Math.max(base, lot);
}

/** Turbo break-even trigger in points: faster in the NY overlap. */
export function beTrigger(session: Session): number {
  return session === "NY_OVERLAP" ? ENGINE.beNy : ENGINE.beMain;
}
