import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchKlines, type Kline } from "@/lib/binance";

// Real spot gold (XAU/USD) from Twelve Data; cached to respect the free daily quota.
const cache = new Map<string, { at: number; rows: Kline[] }>();
const TTL = 120_000;
const MAP: Record<string, string> = { "1m": "1min", "5m": "5min", "15m": "15min", "1h": "1h" };

export const getGoldKlines = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ interval: z.string() }).parse(d))
  .handler(async ({ data }): Promise<{ rows: Kline[]; source: "xau" | "paxg" }> => {
    const hit = cache.get(data.interval);
    if (hit && Date.now() - hit.at < TTL) return { rows: hit.rows, source: "xau" };
    const key = process.env.TWELVE_DATA_API_KEY;
    const iv = MAP[data.interval];
    if (key && iv) {
      try {
        const res = await fetch(
          `https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=${iv}&outputsize=300&timezone=UTC&apikey=${key}`,
          { signal: AbortSignal.timeout(6000) },
        );
        type Row = { datetime: string; open: string; high: string; low: string; close: string; volume?: string };
        const j = (await res.json()) as { status?: string; values?: Row[] };
        if (j.status === "ok" && j.values?.length) {
          const rows = j.values
            .map((v) => ({
              time: Math.floor(Date.parse(v.datetime.replace(" ", "T") + "Z") / 1000),
              open: +v.open, high: +v.high, low: +v.low, close: +v.close,
              volume: Number(v.volume ?? 0) || 1,
            }))
            .reverse();
          cache.set(data.interval, { at: Date.now(), rows });
          return { rows, source: "xau" };
        }
      } catch { /* fall back below */ }
    }
    if (hit) return { rows: hit.rows, source: "xau" };
    return { rows: await fetchKlines("PAXGUSDT", data.interval, 300), source: "paxg" };
  });
