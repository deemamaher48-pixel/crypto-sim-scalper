import { useEffect, useState } from "react";
import { LIVE_WS, fetchKlines, type Kline } from "@/lib/binance";
import { getGoldKlines } from "@/functions/gold.functions";

/** Real-time klines (REST history with fallback hosts + WebSocket that auto-reconnects silently). */
export function useLiveKlines(symbol: string, interval: string) {
  const [klines, setKlines] = useState<Kline[]>([]);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    let ws: WebSocket | null = null;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;
    setKlines([]);

    // Gold: real XAU/USD spot via server (polled), no Binance socket.
    if (symbol === "PAXGUSDT") {
      const poll = async () => {
        try {
          const { rows } = await getGoldKlines({ data: { interval } });
          if (alive) { setKlines(rows); setConnected(true); }
        } catch { if (alive) setConnected(false); }
        if (alive) timer = setTimeout(poll, 30000);
      };
      poll();
      return () => { alive = false; clearTimeout(timer); };
    }

    const load = async () => {
      try {
        const rows = await fetchKlines(symbol, interval, 300);
        if (alive) setKlines(rows);
        return true;
      } catch {
        return false;
      }
    };

    const connect = async () => {
      if (!alive) return;
      const ok = await load();
      if (!alive) return;
      if (!ok) {
        tries++;
        timer = setTimeout(connect, Math.min(30000, 2000 * tries));
        return;
      }
      tries = 0;
      ws = new WebSocket(`${LIVE_WS}/${symbol.toLowerCase()}@kline_${interval}`);
      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (alive) timer = setTimeout(connect, 3000); // reconnect + refill gaps
      };
      ws.onerror = () => ws?.close();
      ws.onmessage = (e) => {
        const k = JSON.parse(e.data).k;
        const bar: Kline = { time: Math.floor(k.t / 1000), open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v };
        setKlines((prev) => {
          if (!prev.length) return prev;
          const last = prev[prev.length - 1];
          if (last?.time === bar.time) return [...prev.slice(0, -1), bar];
          return [...prev.slice(-299), bar];
        });
      };
    };
    connect();
    return () => {
      alive = false;
      clearTimeout(timer);
      if (ws) { ws.onclose = null; ws.close(); }
    };
  }, [symbol, interval]);
  return { klines, connected };
}
