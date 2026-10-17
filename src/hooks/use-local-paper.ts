import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { Kline } from "@/lib/binance";
import {
  computeExtras,
  computeIndicators,
  riskGate,
  sideBracket,
  sideExit,
  sidePnl,
  twoWaySignal,
  type ExitReason,
  type Side,
  type StrategyParams,
} from "@/lib/trading";

// Guest futures-style paper engine: Long & Short on live prices, state kept in localStorage.
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
export type LocalTrade = {
  id: string;
  side: Side;
  size: number; // USDT margin/notional
  qty: number;
  entry: number;
  stop: number;
  target: number;
  exit?: number;
  pnl?: number;
  entryReason: string;
  exitReason?: ExitReason;
  openedAt: string;
  closedAt?: string;
};
type State = { settings: LocalSettings; usdt: number; btc: number; enabled: boolean; trades: LocalTrade[] };

export const START_BALANCE = 10000;
const KEY = "scalper-paper-v1";
const DEFAULT: State = {
  settings: {
    emaFast: 9, emaSlow: 21, rsiPeriod: 14, rsiOverbought: 70, rsiOversold: 30,
    stopLossPct: 0.5, takeProfitPct: 1, positionUsdt: 100, maxTradesPerDay: 20, maxDailyLossUsdt: 50,
    fastMode: false, useAtr: true, atrSlMult: 1.5, atrTpMult: 2.5,
  },
  usdt: START_BALANCE,
  btc: 0,
  enabled: false,
  trades: [],
};

export type BotStatus = { tone: "off" | "watch" | "blocked" | "open" | "ready"; text: string };

export function useLocalPaper(klines: Kline[]) {
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
          settings: { ...DEFAULT.settings, ...saved.settings },
          // Trades saved before Long/Short support were spot longs.
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
  const ind = useMemo(() => computeIndicators(closedBars.map((k) => k.close), st.settings), [closedBars, st.settings]);
  const extras = useMemo(() => computeExtras(closedBars), [closedBars]);
  const open = st.trades.find((t) => !t.closedAt);
  const unrealized = open && price ? sidePnl(open.side, open.qty, open.entry, price) : 0;

  function close(reason: ExitReason, at = price) {
    setSt((s) => {
      const t = s.trades.find((x) => !x.closedAt);
      if (!t || !at) return s;
      const pnl = sidePnl(t.side, t.qty, t.entry, at);
      toast[pnl >= 0 ? "success" : "error"](`إغلاق ${t.side === "long" ? "Long" : "Short"}: ${pnl.toFixed(2)} USDT`);
      return {
        ...s,
        usdt: s.usdt + t.size + pnl,
        trades: s.trades.map((x) =>
          x.id === t.id ? { ...x, exit: at, pnl, exitReason: reason, closedAt: new Date().toISOString() } : x,
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
    if (!g.ok || !price) {
      toast.error(g.reason || "السعر غير متاح بعد");
      return;
    }
    const s = st.settings;
    const br = sideBracket(side, price, {
      atr: s.useAtr ? (extras?.atr ?? null) : null,
      slMult: s.atrSlMult,
      tpMult: s.atrTpMult,
      slPct: s.stopLossPct,
      tpPct: s.takeProfitPct,
    });
    toast.success(`${side === "long" ? "شراء Long" : "بيع Short"} عند ${price.toFixed(2)} — ${reason}`);
    setSt((x) => ({
      ...x,
      usdt: x.usdt - s.positionUsdt,
      trades: [
        {
          id: crypto.randomUUID(), side, size: s.positionUsdt, qty: s.positionUsdt / price, entry: price,
          stop: br.stop, target: br.target, entryReason: reason, openedAt: new Date().toISOString(),
        },
        ...x.trades,
      ].slice(0, 500),
    }));
  }

  let status: BotStatus;
  if (open) status = { tone: "open", text: `صفقة ${open.side === "long" ? "Long" : "Short"} مفتوحة — يراقب الوقف والهدف لحظياً` };
  else if (!st.enabled) status = { tone: "off", text: "البوت متوقف — شغّله ليبدأ مراقبة السوق" };
  else if (!ind || !extras) status = { tone: "watch", text: "يجمع بيانات الشموع لحساب المؤشرات…" };
  else {
    const g = gate();
    const sig = twoWaySignal(ind, extras, st.settings, st.settings.fastMode);
    if (!g.ok) status = { tone: "blocked", text: `متوقف عن الدخول — ${g.reason}` };
    else if (sig.side) status = { tone: "ready", text: `إشارة ${sig.side === "long" ? "Long" : "Short"} — تنفيذ عند إغلاق الشمعة: ${sig.reason}` };
    else status = { tone: "watch", text: sig.reason };
  }

  // Stop/target checked on every live price update.
  useEffect(() => {
    if (!loaded || !open || !price) return;
    const reason = sideExit(price, open, null);
    if (reason) close(reason);
  }, [price, open?.id, loaded]);

  // Entries and EMA-cross exits: once per closed candle.
  useEffect(() => {
    if (!loaded || !ind || !extras || !price) return;
    const candleTime = klines.at(-2)?.time ?? 0;
    if (candleTime === lastCandle.current) return;
    lastCandle.current = candleTime;
    if (open) {
      if (sideExit(price, open, ind) === "ema_cross") close("ema_cross");
      return;
    }
    if (!st.enabled) return;
    const sig = twoWaySignal(ind, extras, st.settings, st.settings.fastMode);
    if (sig.side) openTrade(sig.side, sig.reason);
  }, [closedCount, ind, extras, loaded, st.enabled]);

  return {
    ...st,
    loaded,
    price,
    ind,
    extras,
    open,
    unrealized,
    equity: st.usdt + (open ? open.size + unrealized : 0),
    status,
    setEnabled: (enabled: boolean) => setSt((s) => ({ ...s, enabled })),
    updateSettings: (p: Partial<LocalSettings>) => setSt((s) => ({ ...s, settings: { ...s.settings, ...p } })),
    longNow: () => openTrade("long", "Long تجريبي يدوي"),
    shortNow: () => openTrade("short", "Short تجريبي يدوي"),
    closeNow: () => close("manual"),
    reset: () => setSt({ ...DEFAULT, settings: st.settings }),
  };
}
