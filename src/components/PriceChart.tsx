import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { ema } from "@/lib/trading";
import type { Kline } from "@/lib/binance";

function cssColor(name: string) {
  // Resolve a theme token (oklch) into rgba() via canvas — the chart library can't parse oklch.
  const el = document.createElement("div");
  el.style.color = `var(${name})`;
  document.body.appendChild(el);
  const c = getComputedStyle(el).color;
  el.remove();
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = c;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, bl, a] = ctx.getImageData(0, 0, 1, 1).data;
  return `rgba(${r}, ${g}, ${bl}, ${((a ?? 255) / 255).toFixed(2)})`;
}

export default function PriceChart({
  klines,
  emaFast,
  emaSlow,
  levels,
}: {
  klines: Kline[];
  emaFast: number;
  emaSlow: number;
  levels?: { entry: number; stop: number; target: number } | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const candles = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const fastS = useRef<ISeriesApi<"Line"> | null>(null);
  const slowS = useRef<ISeriesApi<"Line"> | null>(null);
  const lines = useRef<ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]>[]>([]);

  useEffect(() => {
    if (!ref.current) return;
    const fg = cssColor("--muted-foreground");
    const grid = cssColor("--border");
    const c = createChart(ref.current, {
      autoSize: true,
      localization: { locale: "en-US" },
      layout: { background: { color: "transparent" }, textColor: fg, fontFamily: "JetBrains Mono" },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: grid },
      rightPriceScale: { borderColor: grid },
    });
    const bull = cssColor("--bull");
    const bear = cssColor("--bear");
    candles.current = c.addSeries(CandlestickSeries, {
      upColor: bull,
      downColor: bear,
      wickUpColor: bull,
      wickDownColor: bear,
      borderVisible: false,
    });
    fastS.current = c.addSeries(LineSeries, { color: cssColor("--chart-1"), lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    slowS.current = c.addSeries(LineSeries, { color: cssColor("--chart-2"), lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    chart.current = c;
    return () => c.remove();
  }, []);

  useEffect(() => {
    if (!candles.current || klines.length === 0) return;
    candles.current.setData(klines.map((k) => ({ ...k, time: k.time as UTCTimestamp })));
    const closes = klines.map((k) => k.close);
    const toLine = (vals: number[]) =>
      vals.flatMap((v, i) => (Number.isFinite(v) ? [{ time: klines[i]!.time as UTCTimestamp, value: v }] : []));
    fastS.current?.setData(toLine(ema(closes, emaFast)));
    slowS.current?.setData(toLine(ema(closes, emaSlow)));
  }, [klines, emaFast, emaSlow]);

  useEffect(() => {
    const s = candles.current;
    if (!s) return;
    lines.current.forEach((l) => s.removePriceLine(l));
    lines.current = [];
    if (levels) {
      lines.current.push(
        s.createPriceLine({ price: levels.entry, color: cssColor("--primary"), lineWidth: 1, lineStyle: 2, title: "دخول" }),
        s.createPriceLine({ price: levels.stop, color: cssColor("--bear"), lineWidth: 1, lineStyle: 2, title: "SL" }),
        s.createPriceLine({ price: levels.target, color: cssColor("--bull"), lineWidth: 1, lineStyle: 2, title: "TP" }),
      );
    }
  }, [levels]);

  return <div ref={ref} dir="ltr" className="h-[420px] w-full" />;
}
