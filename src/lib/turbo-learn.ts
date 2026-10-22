// TURBO self-learning: adapts entry rules from recent real MT5 results (balance deltas between auto entries).
import type { Side } from "@/lib/trading";

export type Outcome = { side: Side; pnl: number };
export type Adapt = { blockSide: Side | null; minStrength: number; note: string };

export const LEARN = { window: 6, sideLosses: 2, poorWinRate: 0.4, strictStrength: 3, minUsd: 1.5 } as const;

/** Entries (side + balance at entry, oldest first) + current balance → closed bot outcomes.
 *  Manual/test entries are never learned from, and a bot trade whose window contains a manual trade is skipped (its P/L would be mixed). */
export function outcomesFrom(entries: { side: Side; bal: number; manual?: boolean }[], current: number): Outcome[] {
  const out: Outcome[] = [];
  entries.forEach((e, i) => {
    if (e.manual) return;
    const next = entries[i + 1];
    if (next?.manual) return;
    out.push({ side: e.side, pnl: +((next?.bal ?? current) - e.bal).toFixed(2) });
  });
  return out;
}

/** Clean bot outcomes → balance-like series for the circuit breaker (manual trades excluded). */
export function botBalances(start: number, outs: Outcome[]): number[] {
  const r = [start];
  for (const o of outs) r.push(+(r[r.length - 1]! + o.pnl).toFixed(2));
  return r;
}

/** Learns from the last trades: a side that lost twice in a row is paused; a poor win rate demands stronger signals. */
export function adaptTurbo(outcomes: Outcome[]): Adapt {
  // Small smart-exit trims (|pnl| < minUsd) are neutral: neither a loss nor a win.
  const recent = outcomes.filter((o) => Math.abs(o.pnl) >= LEARN.minUsd).slice(-LEARN.window);
  let blockSide: Side | null = null;
  for (const s of ["long", "short"] as Side[]) {
    const own = recent.filter((o) => o.side === s).slice(-LEARN.sideLosses);
    if (own.length === LEARN.sideLosses && own.every((o) => o.pnl < 0)) blockSide = s;
  }
  const wins = recent.filter((o) => o.pnl > 0).length;
  const poor = recent.length >= 4 && wins / recent.length < LEARN.poorWinRate;
  const notes: string[] = [];
  if (blockSide) notes.push(blockSide === "long" ? "الشراء خسر مرتين — موقوف مؤقتاً" : "البيع خسر مرتين — موقوف مؤقتاً");
  if (poor) notes.push(`نسبة نجاح ضعيفة (${wins}/${recent.length}) — إشارات قوية فقط`);
  return { blockSide, minStrength: poor ? LEARN.strictStrength : 0, note: notes.join(" | ") };
}
