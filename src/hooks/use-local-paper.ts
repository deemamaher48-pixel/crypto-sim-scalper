import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { Kline } from "@/lib/binance";
import {
  bracket,
  computeIndicators,
  entrySignal,
  fastEntrySignal,
  exitCheck,
  paperBuy,
  paperSell,
  riskGate,
  type ExitReason,
  type StrategyParams,
} from "@/lib/trading";

// Guest paper-trading engine: runs in the browser on live prices, state kept in localStorage.
export type LocalSettings = StrategyParams & {
  stopLossPct: number;
  takeProfitPct: number;
  positionUsdt: number;
  maxTradesPerDay: number;
  maxDailyLossUsdt: number;
  fastMode: boolean;
};
export type LocalTrade = {
  id: string;
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
    stopLossPct: 0.5, takeProfitPct: 1, positionUsdt: 100, maxTradesPerDay: 20, maxDailyLossUsdt: 50, fastMode: false,
  },
  usdt: START_BALANCE,
  btc: 0,
  enabled: false,
  trades: [],
};

export function useLocalPaper(klines: Kline[]) {
  const [st, setSt] = useState<State>(DEFAULT);
  const [loaded, setLoaded] = useState(false);
  const lastCandle = useRef(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        setSt({ ...DEFAULT, ...saved, settings: { ...DEFAULT.settings, ...saved.settings } });
      }
    } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) localStorage.setItem(KEY, JSON.stringify(st));
  }, [st, loaded]);

  const price = klines.at(-1)?.close ?? 0;
  const closedCount = klines.length - 1;
  const ind = useMemo(
    () => computeIndicators(klines.slice(0, -1).map((k) => k.close), st.settings),
    [closedCount, klines.at(-2)?.close, st.settings],
  );
  const open = st.trades.find((t) => !t.closedAt);

  function close(reason: ExitReason, at = price) {
    setSt((s) => {
      const t = s.trades.find((x) => !x.closedAt);
      if (!t || !at) return s;
      const r = paperSell(t.qty, t.entry, at);
      toast[r.pnl >= 0 ? "success" : "error"](`إغلاق (${reason === "manual" ? "يدوي" : reason}): ${r.pnl.toFixed(2)} USDT`);
      return {
        ...s,
        usdt: s.usdt + r.proceeds,
        btc: Math.max(0, s.btc - t.qty),
        trades: s.trades.map((x) =>
          x.id === t.id ? { ...x, exit: at, pnl: r.pnl, exitReason: reason, closedAt: new Date().toISOString() } : x,
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

  function buy(reason: string) {
    const g = gate();
    if (!g.ok || !price) {
      toast.error(g.reason || "السعر غير متاح بعد");
      return;
    }
    const b = paperBuy(st.settings.positionUsdt, price);
    const br = bracket(price, st.settings.stopLossPct, st.settings.takeProfitPct);
    toast.success(`شراء عند ${price.toFixed(2)} — ${reason}`);
    setSt((s) => ({
      ...s,
      usdt: s.usdt - s.settings.positionUsdt,
      btc: s.btc + b.qty,
      trades: [
        { id: crypto.randomUUID(), qty: b.qty, entry: b.entry, stop: br.stop, target: br.target, entryReason: reason, openedAt: new Date().toISOString() },
        ...s.trades,
      ].slice(0, 500),
    }));
  }

  // Live status, recomputed on every price update.
  let status: { tone: "off" | "watch" | "blocked" | "open" | "ready"; text: string };
  if (open) status = { tone: "open", text: "صفقة مفتوحة — يراقب وقف الخسارة وجني الأرباح لحظياً" };
  else if (!st.enabled) status = { tone: "off", text: "البوت متوقف — شغّله ليبدأ مراقبة السوق" };
  else if (!ind) status = { tone: "watch", text: "يجمع بيانات الشموع لحساب المؤشرات…" };
  else {
    const g = gate();
    const sig = (st.settings.fastMode ? fastEntrySignal : entrySignal)(ind, st.settings);
    if (!g.ok) status = { tone: "blocked", text: `متوقف عن الدخول — ${g.reason}` };
    else if (sig.buy) status = { tone: "ready", text: `إشارة دخول جاهزة — تنفيذ عند إغلاق الشمعة: ${sig.reason}` };
    else status = { tone: "watch", text: sig.reason };
  }

  // Exits: checked on every live price update.
  useEffect(() => {
    if (!loaded || !open || !price) return;
    const reason = exitCheck(price, { stop_price: open.stop, target_price: open.target }, null);
    if (reason) close(reason);
  }, [price, open?.id, loaded]);

  // Entries and EMA-cross exits: evaluated once per closed candle.
  useEffect(() => {
    if (!loaded || !ind || !price) return;
    const candleTime = klines.at(-2)?.time ?? 0;
    if (candleTime === lastCandle.current) return;
    lastCandle.current = candleTime;
    if (open) {
      if (exitCheck(price, { stop_price: open.stop, target_price: open.target }, ind) === "ema_cross") close("ema_cross");
      return;
    }
    if (!st.enabled) return;
    const sig = (st.settings.fastMode ? fastEntrySignal : entrySignal)(ind, st.settings);
    if (sig.buy) buy(sig.reason);
  }, [closedCount, ind, loaded, st.enabled]);

  return {
    ...st,
    loaded,
    price,
    ind,
    open,
    status,
    buyNow: () => buy("شراء تجريبي يدوي"),
    setEnabled: (enabled: boolean) => setSt((s) => ({ ...s, enabled })),
    updateSettings: (p: Partial<LocalSettings>) => setSt((s) => ({ ...s, settings: { ...s.settings, ...p } })),
    closeNow: () => close("manual"),
    reset: () => setSt({ ...DEFAULT, settings: st.settings }),
  };
}
