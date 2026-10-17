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
import { ZoomIn, ZoomOut, LocateFixed } from "lucide-react";
import { Button } from "@/components/ui/button";

function cssColor(name: string) {
  // Resolve a theme token (oklch) into rgba() via canvas — the chart library can't parse oklch.
  const el = document.createElement("div");
  el.style.color = `var(${name})`;
  document.body.appendChild(el);
  const c = getComputedStyle(el).color;
  el.remove();
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const ctx = cv.getContext("2d");
  if (!ctx) return c;
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
  levels?: { entry: number; stop: number; target: number; side?: "long" | "short" } | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const candles = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const fastS = useRef<ISeriesApi<"Line"> | null>(null);
  const slowS = useRef<ISeriesApi<"Line"> | null>(null);
  const lines = useRef<ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]>[]>([]);
  const initialized = useRef(false);

  function returnToLive() {
    chart.current?.priceScale("right").applyOptions({ autoScale: true });
    chart.current?.timeScale().setVisibleLogicalRange({ from: Math.max(0, klines.length - 100), to: klines.length + 3 });
  }

  function zoom(factor: number) {
    const scale = chart.current?.timeScale();
    const range = scale?.getVisibleLogicalRange();
    if (!scale || !range) return;
    const center = (range.from + range.to) / 2;
    const span = Math.max(10, Math.min(2000, (range.to - range.from) * factor));
    scale.setVisibleLogicalRange({ from: center - span / 2, to: center + span / 2 });
  }

  useEffect(() => {
    if (!ref.current) return;
    const fg = cssColor("--muted-foreground");
    const grid = cssColor("--border");
    const c = createChart(ref.current, {
      autoSize: true,
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: false, pinch: false, axisPressedMouseMove: false, axisDoubleClickReset: false },
      localization: {
        locale: "en-US",
        priceFormatter: (p: number) => p.toFixed(2),
        timeFormatter: (t: number) => new Date(t * 1000).toISOString().slice(11, 16),
      },
      layout: { background: { color: "transparent" }, textColor: fg, fontFamily: "JetBrains Mono" },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      timeScale: {
        tickMarkFormatter: (t: number) => new Date(t * 1000).toISOString().slice(11, 16),
        timeVisible: true, secondsVisible: false, borderColor: grid },
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
    return () => { c.remove(); chart.current = null; initialized.current = false; };
  }, []);

  useEffect(() => {
    if (!candles.current || klines.length === 0) return;
    const range = chart.current?.timeScale().getVisibleLogicalRange();
    candles.current.setData(klines.map((k) => ({ ...k, time: k.time as UTCTimestamp })));
    const closes = klines.map((k) => k.close);
    const toLine = (vals: number[]) =>
      vals.flatMap((v, i) => {
        const k = klines[i];
        return Number.isFinite(v) && k ? [{ time: k.time as UTCTimestamp, value: v }] : [];
      });
    fastS.current?.setData(toLine(ema(closes, emaFast)));
    slowS.current?.setData(toLine(ema(closes, emaSlow)));
    if (!initialized.current) {
      returnToLive();
      initialized.current = true;
    } else if (range) {
      chart.current?.timeScale().setVisibleLogicalRange(range);
    }
  }, [klines, emaFast, emaSlow]);

  useEffect(() => {
    const s = candles.current;
    if (!s) return;
    lines.current.forEach((l) => s.removePriceLine(l));
    lines.current = [];
    if (levels) {
      lines.current.push(
        s.createPriceLine({
          price: levels.entry,
          color: cssColor(levels.side === "short" ? "--bear" : "--bull"),
          lineWidth: 2,
          lineStyle: 0,
          title: levels.side === "short" ? "Short ▼" : "Long ▲",
        }),
        s.createPriceLine({ price: levels.stop, color: cssColor("--destructive"), lineWidth: 1, lineStyle: 2, title: "SL" }),
        s.createPriceLine({ price: levels.target, color: cssColor("--bull"), lineWidth: 1, lineStyle: 2, title: "TP" }),
      );
    }
  }, [levels]);

  return (
    <div dir="ltr">
      <div className="flex justify-end gap-1 border-b pb-1">
        <Button variant="ghost" size="icon" aria-label="تكبير الشارت" title="تكبير الشارت" onClick={() => zoom(0.8)}><ZoomIn className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" aria-label="تصغير الشارت" title="تصغير الشارت" onClick={() => zoom(1.25)}><ZoomOut className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" aria-label="العودة للسعر الحالي" title="العودة للسعر الحالي" onClick={returnToLive}><LocateFixed className="h-4 w-4" /></Button>
      </div>
      <div ref={ref} className="h-[420px] w-full" />
    </div>
  );
}
