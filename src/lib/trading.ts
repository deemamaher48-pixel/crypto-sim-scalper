// Pure trading logic: indicators, signals, risk rules. No I/O — shared by server and UI.

export function ema(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i]! * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder RSI. */
export function rsi(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i]! - values[i - 1]!;
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i]! - values[i - 1]!;
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export type StrategyParams = {
  emaFast: number;
  emaSlow: number;
  rsiPeriod: number;
  rsiOverbought: number;
  rsiOversold: number;
};

export type Indicators = {
  emaFast: number;
  emaSlow: number;
  rsi: number;
  prevEmaFast: number;
  prevEmaSlow: number;
  prevRsi: number;
};

export function computeIndicators(closes: number[], p: StrategyParams): Indicators | null {
  const f = ema(closes, p.emaFast);
  const s = ema(closes, p.emaSlow);
  const r = rsi(closes, p.rsiPeriod);
  const n = closes.length - 1;
  if (n < 1 || [f[n], s[n], r[n], f[n - 1], s[n - 1], r[n - 1]].some((v) => !Number.isFinite(v)))
    return null;
  return {
    emaFast: f[n]!,
    emaSlow: s[n]!,
    rsi: r[n]!,
    prevEmaFast: f[n - 1]!,
    prevEmaSlow: s[n - 1]!,
    prevRsi: r[n - 1]!,
  };
}

/** Long-only entry: bullish EMA cross, or RSI bouncing out of oversold while trend is up. Never buy overbought. */
export function entrySignal(ind: Indicators, p: StrategyParams): { buy: boolean; reason: string } {
  if (ind.rsi >= p.rsiOverbought) return { buy: false, reason: "RSI في منطقة التشبع الشرائي" };
  const crossUp = ind.prevEmaFast <= ind.prevEmaSlow && ind.emaFast > ind.emaSlow;
  if (crossUp) return { buy: true, reason: `تقاطع EMA ${p.emaFast}/${p.emaSlow} صاعد` };
  const bounce = ind.emaFast > ind.emaSlow && ind.prevRsi < p.rsiOversold && ind.rsi >= p.rsiOversold;
  if (bounce) return { buy: true, reason: "ارتداد RSI من التشبع البيعي باتجاه صاعد" };
  return {
    buy: false,
    reason:
      ind.emaFast > ind.emaSlow
        ? "يراقب السوق — الاتجاه صاعد، في انتظار تقاطع جديد أو ارتداد RSI"
        : `يراقب السوق — في انتظار تقاطع EMA ${p.emaFast} صاعد فوق EMA ${p.emaSlow}`,
  };
}

export type ExitReason = "stop_loss" | "take_profit" | "ema_cross" | "manual";

export function exitCheck(
  price: number,
  trade: { stop_price: number; target_price: number },
  ind: Indicators | null,
): ExitReason | null {
  if (price <= trade.stop_price) return "stop_loss";
  if (price >= trade.target_price) return "take_profit";
  if (ind && ind.prevEmaFast >= ind.prevEmaSlow && ind.emaFast < ind.emaSlow) return "ema_cross";
  return null;
}

export function bracket(entry: number, stopLossPct: number, takeProfitPct: number) {
  return {
    stop: entry * (1 - stopLossPct / 100),
    target: entry * (1 + takeProfitPct / 100),
  };
}

export type RiskInput = {
  hasOpenTrade: boolean;
  tradesToday: number;
  maxTradesPerDay: number;
  pnlToday: number;
  maxDailyLossUsdt: number;
  positionUsdt: number;
  freeUsdt: number;
};

export function riskGate(r: RiskInput): { ok: boolean; reason: string } {
  if (r.hasOpenTrade) return { ok: false, reason: "توجد صفقة مفتوحة" };
  if (r.tradesToday >= r.maxTradesPerDay) return { ok: false, reason: "تم بلوغ الحد الأقصى للصفقات اليومية" };
  if (r.pnlToday <= -Math.abs(r.maxDailyLossUsdt)) return { ok: false, reason: "تم بلوغ حد الخسارة اليومية" };
  if (r.positionUsdt < 10) return { ok: false, reason: "حجم الصفقة أقل من الحد الأدنى (10 USDT)" };
  if (r.freeUsdt < r.positionUsdt) return { ok: false, reason: "رصيد USDT غير كافٍ" };
  return { ok: true, reason: "" };
}

export const exitReasonLabel: Record<string, string> = {
  stop_loss: "وقف الخسارة",
  take_profit: "جني الأرباح",
  ema_cross: "تقاطع EMA هابط",
  manual: "إغلاق يدوي",
};

export function floorToStep(qty: number, step: number): number {
  const decimals = Math.max(0, Math.round(-Math.log10(step)));
  const v = Math.floor(qty / step + 1e-9) * step;
  return Number(v.toFixed(decimals));
}

export const PAPER_FEE = 0.001; // 0.1% per side, like Binance spot

/** Simulated market buy of `sizeUsdt` at `price`; the buy fee is taken from the received quantity. */
export function paperBuy(sizeUsdt: number, price: number) {
  return { qty: (sizeUsdt / price) * (1 - PAPER_FEE), entry: price };
}

/** Simulated market sell; pnl is net of both fees. */
export function paperSell(qty: number, entry: number, price: number) {
  const proceeds = qty * price * (1 - PAPER_FEE);
  const cost = (qty * entry) / (1 - PAPER_FEE); // USDT spent on the buy
  return { proceeds, pnl: proceeds - cost };
}

/** Fast scalping: looser entries for more frequent trades — any uptrend with RSI not overbought, or a deep RSI dip. */
export function fastEntrySignal(ind: Indicators, p: StrategyParams): { buy: boolean; reason: string } {
  if (ind.rsi >= p.rsiOverbought) return { buy: false, reason: "RSI في منطقة التشبع الشرائي" };
  if (ind.emaFast > ind.emaSlow) return { buy: true, reason: "سكالبينغ سريع: اتجاه صاعد (EMA السريع فوق البطيء)" };
  if (ind.rsi <= p.rsiOversold + 5) return { buy: true, reason: "سكالبينغ سريع: RSI منخفض جداً" };
  return { buy: false, reason: `يراقب السوق — في انتظار صعود EMA ${p.emaFast} فوق EMA ${p.emaSlow}` };
}

// ---------- Two-way (futures-style) paper trading ----------
export type Side = "long" | "short";
export type Candle = { high: number; low: number; close: number };

export function macd(values: number[], fast = 12, slow = 26, signal = 9) {
  const f = ema(values, fast);
  const s = ema(values, slow);
  const line = values.map((_, i) => f[i]! - s[i]!);
  const start = line.findIndex((v) => Number.isFinite(v));
  const sig: number[] = new Array(values.length).fill(NaN);
  if (start >= 0) {
    const e = ema(line.slice(start), signal);
    e.forEach((v, i) => (sig[start + i] = v));
  }
  return { line, signal: sig, hist: line.map((v, i) => v - sig[i]!) };
}

/** Wilder ATR. */
export function atr(c: Candle[], period = 14): number[] {
  const out: number[] = new Array(c.length).fill(NaN);
  if (c.length <= period) return out;
  const tr = c.map((k, i) =>
    i === 0 ? k.high - k.low : Math.max(k.high - k.low, Math.abs(k.high - c[i - 1]!.close), Math.abs(k.low - c[i - 1]!.close)),
  );
  let a = tr.slice(1, period + 1).reduce((x, y) => x + y, 0) / period;
  out[period] = a;
  for (let i = period + 1; i < c.length; i++) {
    a = (a * (period - 1) + tr[i]!) / period;
    out[i] = a;
  }
  return out;
}

export type Extras = { macd: number; macdSignal: number; hist: number; atr: number };
export function computeExtras(c: Candle[], atrPeriod = 14): Extras | null {
  const m = macd(c.map((k) => k.close));
  const a = atr(c, atrPeriod);
  const n = c.length - 1;
  const v = { macd: m.line[n]!, macdSignal: m.signal[n]!, hist: m.hist[n]!, atr: a[n]! };
  return n > 0 && Object.values(v).every(Number.isFinite) ? v : null;
}

/** Long on bullish cross/trend with positive MACD momentum; Short on bearish cross/trend with negative momentum. */
export function twoWaySignal(
  ind: Indicators,
  x: Extras,
  p: StrategyParams,
  fast: boolean,
): { side: Side | null; reason: string } {
  const up = ind.emaFast > ind.emaSlow;
  const crossUp = ind.prevEmaFast <= ind.prevEmaSlow && up;
  const crossDown = ind.prevEmaFast >= ind.prevEmaSlow && !up;
  if ((fast ? up : crossUp) && x.hist > 0 && ind.rsi < p.rsiOverbought)
    return { side: "long", reason: `${fast ? "سريع: " : ""}EMA صاعد + MACD إيجابي` };
  if ((fast ? !up : crossDown) && x.hist < 0 && ind.rsi > p.rsiOversold)
    return { side: "short", reason: `${fast ? "سريع: " : ""}EMA هابط + MACD سلبي` };
  if (up && x.hist <= 0) return { side: null, reason: "يراقب — الاتجاه صاعد لكن MACD لم يؤكد الزخم" };
  if (!up && x.hist >= 0) return { side: null, reason: "يراقب — الاتجاه هابط لكن MACD لم يؤكد الزخم" };
  if (ind.rsi >= p.rsiOverbought) return { side: null, reason: "يراقب — RSI متشبع شرائياً، لا Long" };
  if (ind.rsi <= p.rsiOversold) return { side: null, reason: "يراقب — RSI متشبع بيعياً، لا Short" };
  return { side: null, reason: "يراقب السوق — في انتظار تقاطع EMA جديد مؤكد بـ MACD" };
}

/** Stop/target for either side: ATR multiples when atr is given, else fixed percentages. */
export function sideBracket(
  side: Side,
  entry: number,
  o: { atr?: number | null; slMult: number; tpMult: number; slPct: number; tpPct: number },
) {
  const slDist = o.atr ? o.atr * o.slMult : (entry * o.slPct) / 100;
  const tpDist = o.atr ? o.atr * o.tpMult : (entry * o.tpPct) / 100;
  return side === "long"
    ? { stop: entry - slDist, target: entry + tpDist }
    : { stop: entry + slDist, target: entry - tpDist };
}

export function sideExit(
  price: number,
  t: { side: Side; stop: number; target: number },
  ind: Indicators | null,
): ExitReason | null {
  if (t.side === "long") return exitCheck(price, { stop_price: t.stop, target_price: t.target }, ind);
  if (price >= t.stop) return "stop_loss";
  if (price <= t.target) return "take_profit";
  if (ind && ind.prevEmaFast <= ind.prevEmaSlow && ind.emaFast > ind.emaSlow) return "ema_cross";
  return null;
}

/** Futures-style PnL net of 0.1% fee on entry and exit notional. */
export function sidePnl(side: Side, qty: number, entry: number, exit: number) {
  const dir = side === "long" ? 1 : -1;
  return dir * (exit - entry) * qty - PAPER_FEE * (entry + exit) * qty;
}
