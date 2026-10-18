import { useEffect, useRef } from "react";

// Official TradingView Advanced Chart widget — served by TradingView, runs all day.
export default function TradingViewChart({ symbol, interval }: { symbol: string; interval: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>';
    const s = document.createElement("script");
    s.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    s.async = true;
    s.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval,
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "ar_AE",
      allow_symbol_change: true,
      studies: ["STD;VWAP", "STD;RSI"],
      support_host: "https://www.tradingview.com",
    });
    el.appendChild(s);
    return () => { el.innerHTML = ""; };
  }, [symbol, interval]);
  return <div ref={ref} className="tradingview-widget-container h-[480px] w-full" />;
}
