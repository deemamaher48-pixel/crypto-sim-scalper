// TURBO heavy trend checks (5m structure, 1H/4H) only apply after a stop hit or against strong opposite momentum — user rule.
import { firm } from "@/lib/reversal";

export const HEAVY = { stopUsd: 1.5 } as const;

/** True when the last closed trade was a real loss (stop) or a firm 5m candle opposes the side. */
export function needsHeavyGate(lastPnl: number | undefined, m5: { open: number; high: number; low: number; close: number }[], side: "long" | "short"): boolean {
  if (lastPnl !== undefined && lastPnl <= -HEAVY.stopUsd) return true;
  const f = m5.length ? firm(m5 as any) : null;
  return f !== null && f !== side;
}
