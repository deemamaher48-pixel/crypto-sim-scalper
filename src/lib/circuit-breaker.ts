export const BREAKER = { maxLossStreak: 3, dailyLossUsd: 20, minLossUsd: 1.5 } as const;

/** Balances at today's successive auto entries + current balance → block reason.
 *  Only real losses (≥ minLossUsd) count toward the streak; small smart-exit trims are ignored. */
export function circuitBreaker(bals: number[]): string | null {
  if (bals.length < 2) return null;
  if (bals[0]! - bals[bals.length - 1]! >= BREAKER.dailyLossUsd) return "daily_loss_limit";
  let streak = 0;
  for (let i = bals.length - 1; i > 0; i--) {
    const d = bals[i]! - bals[i - 1]!;
    if (d <= -BREAKER.minLossUsd) streak++;
    else if (d < 0) continue; // tiny trim: neither loss nor win
    else break;
  }
  return streak >= BREAKER.maxLossStreak ? "loss_streak_3" : null;
}
