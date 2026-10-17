import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LIVE_REST, LIVE_WS, type Kline } from "@/lib/binance";

/** Real-time klines from the live Binance market (REST history + WebSocket updates). */
export function useLiveKlines(symbol: string, interval: string) {
  const [klines, setKlines] = useState<Kline[]>([]);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    let ws: WebSocket | null = null;
    let alive = true;
    fetch(`${LIVE_REST}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=300`)
      .then((r) => r.json())
      .then((rows: unknown[][]) => {
        if (!alive) return;
        setKlines(
          rows.map((r) => ({
            time: Math.floor(Number(r[0]) / 1000),
            open: +r[1]!, high: +r[2]!, low: +r[3]!, close: +r[4]!, volume: +r[5]!,
          })),
        );
        ws = new WebSocket(`${LIVE_WS}/${symbol.toLowerCase()}@kline_${interval}`);
        ws.onopen = () => setConnected(true);
        ws.onclose = () => setConnected(false);
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
      })
      .catch(() => toast.error("تعذر الاتصال ببيانات السوق"));
    return () => {
      alive = false;
      ws?.close();
    };
  }, [symbol, interval]);
  return { klines, connected };
}

