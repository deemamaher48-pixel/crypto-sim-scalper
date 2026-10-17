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
