/** Keep every trade; presentation windows must not truncate persisted history. */
export function prependTrade<T>(history: T[], trade: T): T[] {
  return [trade, ...history];
}

export function tradeOutcome(pnl: number) {
  return pnl > 0 ? "جني أرباح" : pnl < 0 ? "وقف خسارة" : "تعادل";
}