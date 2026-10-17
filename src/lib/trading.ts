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

/** MT5/broker-style cost: half of a ~0.01% spread charged on each side (no 0.1% commission). */
export const PAPER_FEE = 0.00005;

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
export type Candle = { high: number; low: number; close: number; volume?: number; time?: number };

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

export function sma(values: number[], period: number): number[] {
  return values.map((_, i) =>
    i < period - 1 ? NaN : values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period,
  );
}

/** Stochastic %K (raw) and %D (SMA of %K). */
export function stochastic(c: Candle[], period = 14, dPeriod = 3) {
  const k = c.map((_, i) => {
    if (i < period - 1) return NaN;
    const w = c.slice(i - period + 1, i + 1);
    const hi = Math.max(...w.map((x) => x.high));
    const lo = Math.min(...w.map((x) => x.low));
    return hi === lo ? 50 : ((c[i]!.close - lo) / (hi - lo)) * 100;
  });
  const start = k.findIndex(Number.isFinite);
  const d: number[] = new Array(c.length).fill(NaN);
  if (start >= 0) sma(k.slice(start), dPeriod).forEach((v, i) => (d[start + i] = v));
  return { k, d };
}

export function bollinger(values: number[], period = 20, mult = 2) {
  const mid = sma(values, period);
  const upper: number[] = [];
  const lower: number[] = [];
  values.forEach((_, i) => {
    if (!Number.isFinite(mid[i]!)) {
      upper.push(NaN);
      lower.push(NaN);
      return;
    }
    const w = values.slice(i - period + 1, i + 1);
    const sd = Math.sqrt(w.reduce((a, v) => a + (v - mid[i]!) ** 2, 0) / period);
    upper.push(mid[i]! + mult * sd);
    lower.push(mid[i]! - mult * sd);
  });
  return { mid, upper, lower };
}

/** VWAP anchored at the start of the current UTC day (falls back to all candles given). */
export function vwap(c: Candle[]): number {
  const last = c.at(-1)?.time;
  const dayStart = last ? Math.floor(last / 86400) * 86400 : -Infinity;
  let pv = 0;
  let vol = 0;
  for (const k of c) {
    if ((k.time ?? 0) < dayStart) continue;
    const v = k.volume ?? 0;
    pv += ((k.high + k.low + k.close) / 3) * v;
    vol += v;
  }
  return vol > 0 ? pv / vol : NaN;
}

/** Wilder ADX with +DI / -DI. */
export function adx(c: Candle[], period = 14) {
  const n = c.length;
  const out = { adx: new Array(n).fill(NaN) as number[], plusDi: new Array(n).fill(NaN) as number[], minusDi: new Array(n).fill(NaN) as number[] };
  if (n < period * 2 + 1) return out;
  let tr = 0, pdm = 0, mdm = 0;
  const dx: number[] = [];
  for (let i = 1; i < n; i++) {
    const k = c[i]!, p = c[i - 1]!;
    const up = k.high - p.high;
    const down = p.low - k.low;
    const t = Math.max(k.high - k.low, Math.abs(k.high - p.close), Math.abs(k.low - p.close));
    const pm = up > down && up > 0 ? up : 0;
    const mm = down > up && down > 0 ? down : 0;
    if (i <= period) {
      tr += t; pdm += pm; mdm += mm;
      if (i < period) continue;
    } else {
      tr = tr - tr / period + t;
      pdm = pdm - pdm / period + pm;
      mdm = mdm - mdm / period + mm;
    }
    const pdi = tr ? (100 * pdm) / tr : 0;
    const mdi = tr ? (100 * mdm) / tr : 0;
    out.plusDi[i] = pdi;
    out.minusDi[i] = mdi;
    dx.push(pdi + mdi ? (100 * Math.abs(pdi - mdi)) / (pdi + mdi) : 0);
    if (dx.length === period) out.adx[i] = dx.reduce((a, b) => a + b, 0) / period;
    else if (dx.length > period) out.adx[i] = (out.adx[i - 1]! * (period - 1) + dx.at(-1)!) / period;
  }
  return out;
}

export type Extras = {
  macd: number; macdSignal: number; hist: number; atr: number;
  stochK: number; stochD: number;
  bbUpper: number; bbMid: number; bbLower: number; bbWidthPct: number;
  vwap: number; adx: number; plusDi: number; minusDi: number;
  ema50: number; ema200: number; close: number;
};
export function computeExtras(c: Candle[], atrPeriod = 14): Extras | null {
  const closes = c.map((k) => k.close);
  const m = macd(closes);
  const a = atr(c, atrPeriod);
  const st = stochastic(c);
  const bb = bollinger(closes);
  const dx = adx(c);
  const n = c.length - 1;
  if (n < 1) return null;
  const core = { macd: m.line[n]!, macdSignal: m.signal[n]!, hist: m.hist[n]!, atr: a[n]! };
  if (!Object.values(core).every(Number.isFinite)) return null;
  return {
    ...core,
    stochK: st.k[n]!, stochD: st.d[n]!,
    bbUpper: bb.upper[n]!, bbMid: bb.mid[n]!, bbLower: bb.lower[n]!,
    bbWidthPct: ((bb.upper[n]! - bb.lower[n]!) / bb.mid[n]!) * 100,
    vwap: vwap(c), adx: dx.adx[n]!, plusDi: dx.plusDi[n]!, minusDi: dx.minusDi[n]!,
    ema50: ema(closes, 50)[n]!, ema200: ema(closes, 200)[n]!, close: closes[n]!,
  };
}

export const ADX_TREND = 20;

/** Long on bullish cross/trend with positive MACD momentum; Short on bearish cross/trend with negative momentum. */
export function twoWaySignal(
  ind: Indicators,
  x: Extras,
  p: StrategyParams,
  fast: boolean,
): { side: Side | null; reason: string } {
  // Low ADX = ranging market: fade the Bollinger band edges with Stochastic confirmation.
  if (Number.isFinite(x.adx) && x.adx < ADX_TREND && Number.isFinite(x.bbLower)) {
    if (x.close <= x.bbLower && x.stochK < 20) return { side: "long", reason: "نطاق (ADX منخفض): لمس Bollinger السفلي + Stochastic متشبع بيعياً" };
    if (x.close >= x.bbUpper && x.stochK > 80) return { side: "short", reason: "نطاق (ADX منخفض): لمس Bollinger العلوي + Stochastic متشبع شرائياً" };
    return { side: null, reason: `سوق عرضي (ADX ${x.adx.toFixed(0)}) — ينتظر لمس حواف Bollinger مع Stochastic` };
  }
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

/** Futures-style PnL net of the MT5-style spread cost on entry and exit. */
export function sidePnl(side: Side, qty: number, entry: number, exit: number) {
  const dir = side === "long" ? 1 : -1;
  return dir * (exit - entry) * qty - PAPER_FEE * (entry + exit) * qty;
}
