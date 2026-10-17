import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { prependTrade, tradeOutcome } from "@/lib/trade-history";
import type { Kline } from "@/lib/binance";
import { computeExtras, computeIndicators, riskGate, sidePnl, type Side, type StrategyParams } from "@/lib/trading";
import {
  SMART, breakevenStop, inCooldown, inRolloverWindow, smartBracket, smartCandleExit, smartSignal, type SmartSignal,
} from "@/lib/smart-scalp";

// Guest futures-style paper engine running Smart VWAP & Momentum Scalping (5m + 15m) on live prices; state in localStorage.
export type LocalSettings = StrategyParams & {
  stopLossPct: number;
  takeProfitPct: number;
  positionUsdt: number;
  maxTradesPerDay: number;
  maxDailyLossUsdt: number;
  fastMode: boolean;
  useAtr: boolean;
  atrSlMult: number;
  atrTpMult: number;
};
export type LocalExit = "stop_loss" | "take_profit" | "ema_cross" | "manual" | "time_stop" | "vwap_break" | "trailing";
export type LocalTrade = {
  id: string;
  side: Side;
  size: number; // USDT margin/notional
  qty: number;
  remainingQty?: number;
  realized?: number; // net pnl already booked by the TP1 partial close
  tp1?: number;
  tp1Hit?: boolean;
  best?: number; // most favourable price seen
  entry: number;
  stop: number;
  target: number;
  exit?: number;
  pnl?: number;
  entryReason: string;
  exitReason?: LocalExit;
  openedAt: string;
  closedAt?: string;
};
type State = { settings: LocalSettings; usdt: number; btc: number; enabled: boolean; trades: LocalTrade[] };

export const START_BALANCE = 10000;
const KEY = "scalper-paper-v1";
const DEFAULT: State = {
  settings: {
    emaFast: 9, emaSlow: 21, rsiPeriod: 9, rsiOverbought: 70, rsiOversold: 30,
    stopLossPct: 0.5, takeProfitPct: 1, positionUsdt: 100, maxTradesPerDay: 20, maxDailyLossUsdt: 50,
    fastMode: false, useAtr: true, atrSlMult: 1.5, atrTpMult: 3,
  },
  usdt: START_BALANCE,
  btc: 0,
  enabled: false,
  trades: [],
};

export type BotStatus = { tone: "off" | "watch" | "blocked" | "open" | "ready"; text: string };

export function useLocalPaper(klines: Kline[], klines15: Kline[], gold = true) {
  const rollover = (ms: number) => gold && inRolloverWindow(ms);
  const [st, setSt] = useState<State>(DEFAULT);
  const [loaded, setLoaded] = useState(false);
  const lastCandle = useRef(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw) as State;
        setSt({
          ...DEFAULT,
          ...saved,
          settings: { ...DEFAULT.settings, ...saved.settings, emaFast: 9, emaSlow: 21, rsiPeriod: 9 },
          trades: (saved.trades ?? []).map((t) => ({ ...t, side: t.side ?? "long", size: t.size ?? t.qty * t.entry })),
        });
      }
    } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) localStorage.setItem(KEY, JSON.stringify(st));
  }, [st, loaded]);

  const price = klines.at(-1)?.close ?? 0;
  const closedCount = klines.length - 1;
  const closedBars = useMemo(() => klines.slice(0, -1), [closedCount, klines.at(-2)?.close]);
  const closed15 = useMemo(() => klines15.slice(0, -1), [klines15.length, klines15.at(-2)?.close]);
  const ind = useMemo(() => computeIndicators(closedBars.map((k) => k.close), st.settings), [closedBars, st.settings]);
  const extras = useMemo(() => computeExtras(closedBars), [closedBars]);
  const signal: SmartSignal | null = useMemo(() => smartSignal(closedBars, closed15), [closedBars, closed15]);
  const open = st.trades.find((t) => !t.closedAt);
  const rem = (t: LocalTrade) => t.remainingQty ?? t.qty;
  const unrealized = open && price ? (open.realized ?? 0) + sidePnl(open.side, rem(open), open.entry, price) : 0;
  const lastStop = st.trades.find((t) => t.closedAt && (t.pnl ?? 0) < 0);
  const lastStopAt = lastStop?.closedAt ? Date.parse(lastStop.closedAt) : null;

  function close(reason: LocalExit, at = price) {
    setSt((s) => {
      const t = s.trades.find((x) => !x.closedAt);
      if (!t || !at) return s;
      const q = rem(t);
      const part = sidePnl(t.side, q, t.entry, at);
      const pnl = (t.realized ?? 0) + part;
      toast[pnl > 0 ? "success" : pnl < 0 ? "error" : "message"](tradeOutcome(pnl));
      return {
        ...s,
        usdt: s.usdt + t.size * (q / t.qty) + part,
        trades: s.trades.map((x) =>
          x.id === t.id ? { ...x, exit: at, pnl, remainingQty: 0, exitReason: reason, closedAt: new Date().toISOString() } : x,
        ),
      };
    });
  }

  /** TP1: book 60% and move the stop to breakeven + spread. */
  function takeTp1(at: number) {
    setSt((s) => {
      const t = s.trades.find((x) => !x.closedAt);
      if (!t || t.tp1Hit) return s;
      const q = t.qty * SMART.tp1Close;
      const part = sidePnl(t.side, q, t.entry, at);
      toast.success(`الهدف الأول تحقق — إغلاق 60% بربح ${part.toFixed(2)}$ ونقل الوقف للدخول`);
      return {
        ...s,
        usdt: s.usdt + t.size * SMART.tp1Close + part,
        trades: s.trades.map((x) =>
          x.id === t.id
            ? { ...x, tp1Hit: true, realized: part, remainingQty: t.qty - q, stop: breakevenStop(t.side, t.entry) }
            : x,
        ),
      };
    });
  }

  function gate() {
    const today = new Date().toISOString().slice(0, 10);
    const todays = st.trades.filter((t) => t.openedAt.startsWith(today));
    return riskGate({
      hasOpenTrade: !!open,
      tradesToday: todays.length,
      maxTradesPerDay: st.settings.maxTradesPerDay,
      pnlToday: todays.reduce((a, t) => a + (t.pnl ?? 0), 0),
      maxDailyLossUsdt: st.settings.maxDailyLossUsdt,
      positionUsdt: st.settings.positionUsdt,
      freeUsdt: st.usdt,
    });
  }

  function openTrade(side: Side, reason: string) {
    const g = gate();
    const a = signal?.atr ?? extras?.atr;
    if (!g.ok || !price || !a) {
      toast.error(g.reason || "السعر أو ATR غير متاح بعد");
      return;
    }
    const s = st.settings;
    const br = smartBracket(side, price, a);
    toast.success(`${side === "long" ? "شراء Long" : "بيع Short"} عند ${price.toFixed(2)} — ${reason}`);
    setSt((x) => ({
      ...x,
      usdt: x.usdt - s.positionUsdt,
      trades: prependTrade(x.trades, {
        id: crypto.randomUUID(), side, size: s.positionUsdt, qty: s.positionUsdt / price, remainingQty: s.positionUsdt / price,
        realized: 0, tp1: br.tp1, tp1Hit: false, best: price, entry: price,
        stop: br.stop, target: br.target, entryReason: reason, openedAt: new Date().toISOString(),
      }),
    }));
  }

  let status: BotStatus;
  if (open) status = { tone: "open", text: `صفقة ${open.side === "long" ? "Long" : "Short"} مفتوحة${open.tp1Hit ? " — الهدف الأول تحقق، الوقف على الدخول" : " — يراقب الوقف والأهداف"}` };
  else if (!st.enabled) status = { tone: "off", text: "البوت متوقف — شغّله ليبدأ مراقبة السوق" };
  else if (!signal) status = { tone: "watch", text: "يجمع بيانات شموع 5m و15m…" };
  else {
    const g = gate();
    if (!g.ok) status = { tone: "blocked", text: `متوقف عن الدخول — ${g.reason}` };
    else if (inRolloverWindow(Date.now())) status = { tone: "blocked", text: "إيقاف وقت إغلاق/افتتاح الذهب (23:00–01:00 UTC)" };
    else if (inCooldown(lastStopAt, Date.now())) status = { tone: "blocked", text: "فترة تبريد بعد وقف الخسارة (15 دقيقة)" };
    else if (signal.side) status = { tone: "ready", text: signal.reason };
    else status = { tone: "watch", text: signal.reason };
  }

  // Stop / TP1 / TP2 checked on every live price update; also track the best price for the time-stop.
  useEffect(() => {
    if (!loaded || !open || !price) return;
    const d = open.side === "long" ? 1 : -1;
    if (d * (price - open.stop) <= 0) return close("stop_loss", price);
    if (d * (price - open.target) >= 0) return close("take_profit", price);
    if (!open.tp1Hit && open.tp1 != null && d * (price - open.tp1) >= 0) return takeTp1(price);
    if (open.best == null || d * (price - open.best) > 0)
      setSt((s) => ({ ...s, trades: s.trades.map((x) => (x.id === open.id ? { ...x, best: price } : x)) }));
  }, [price, open?.id, open?.tp1Hit, loaded]);

  // Entries and candle-close exits: once per closed 5m candle.
  useEffect(() => {
    if (!loaded || !price || !closedBars.length) return;
    const candleTime = closedBars.at(-1)!.time;
    if (candleTime === lastCandle.current) return;
    lastCandle.current = candleTime;
    if (open) {
      const r = smartCandleExit(
        { side: open.side, entry: open.entry, tp1: open.tp1 ?? open.target, tp1Hit: !!open.tp1Hit, best: open.best ?? open.entry, openedAt: open.openedAt },
        closedBars, Date.now(),
      );
      if (r) close(r);
      return;
    }
    if (!st.enabled || !signal?.side || !gate().ok || inRolloverWindow(Date.now()) || inCooldown(lastStopAt, Date.now())) return;
    openTrade(signal.side, signal.reason);
  }, [closedCount, signal, loaded, st.enabled]);

  return {
    ...st,
    loaded,
    price,
    ind,
    extras,
    signal,
    open,
    unrealized,
    equity: st.usdt + (open ? open.size * (rem(open) / open.qty) + sidePnl(open.side, rem(open), open.entry, price || open.entry) : 0),
    status,
    setEnabled: (enabled: boolean) => setSt((s) => ({ ...s, enabled })),
    updateSettings: (p: Partial<LocalSettings>) => setSt((s) => ({ ...s, settings: { ...s.settings, ...p } })),
    longNow: () => openTrade("long", "Long تجريبي يدوي"),
    shortNow: () => openTrade("short", "Short تجريبي يدوي"),
    closeNow: () => close("manual"),
    reset: () => setSt({ ...DEFAULT, settings: st.settings }),
  };
}
