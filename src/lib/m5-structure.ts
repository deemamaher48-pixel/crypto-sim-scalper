// 5m structure gate for TURBO: block trades against a broken 5m structure / 5m trend.
import { ema } from "@/lib/trading";

type Bar = { high: number; low: number; close: number };

export function m5Gate(m5: Bar[], side: "long" | "short", lookback = 12): string | null {
  const n = m5.length - 1;
  if (n < 50) return null;
  const cl = m5.map((k) => k.close);
  const e21 = ema(cl, 21)[n]!, e50 = ema(cl, 50)[n]!;
  const prior = m5.slice(n - lookback, n);
  const lo = Math.min(...prior.map((k) => k.low)), hi = Math.max(...prior.map((k) => k.high));
  const c = m5[n]!.close;
  if (side === "long" && (c < lo || e21 < e50)) return "فريم 5د هابط/كسر قاع — ممنوع الشراء";
  if (side === "short" && (c > hi || e21 > e50)) return "فريم 5د صاعد/كسر قمة — ممنوع البيع";
  return null;
}
