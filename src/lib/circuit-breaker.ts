export const BREAKER = { maxLossStreak: 3, dailyLossUsd: 20 } as const;

/** Balances at today's successive auto entries + current balance → block reason (3 losses in a row, or daily loss limit). */
export function circuitBreaker(bals: number[]): string | null {
  if (bals.length < 2) return null;
  if (bals[0]! - bals[bals.length - 1]! >= BREAKER.dailyLossUsd) return "daily_loss_limit";
  let streak = 0;
  for (let i = bals.length - 1; i > 0; i--) { if (bals[i]! < bals[i - 1]!) streak++; else break; }
  return streak >= BREAKER.maxLossStreak ? "loss_streak_3" : null;
}
