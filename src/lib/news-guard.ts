// High-impact USD news freeze: no new entries 10 min before/after an event.
export const NEWS_FREEZE_MS = 10 * 60_000;
const FEED = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";

type Ev = { country?: string; impact?: string; date?: string };

export function highImpactTimes(events: Ev[]): number[] {
  return events
    .filter((e) => e.impact === "High" && (e.country === "USD" || e.country === "ALL"))
    .map((e) => Date.parse(e.date ?? ""))
    .filter((t) => Number.isFinite(t));
}

/** Returns the event time causing a freeze, or null if trading is allowed. */
export function newsFreeze(times: number[], now: number, win = NEWS_FREEZE_MS): number | null {
  return times.find((t) => Math.abs(now - t) <= win) ?? null;
}

let cache: { at: number; times: number[] } | null = null;
export async function fetchNewsTimes(): Promise<number[]> {
  if (cache && Date.now() - cache.at < 30 * 60_000) return cache.times;
  try {
    const r = await fetch(FEED);
    if (!r.ok) return cache?.times ?? [];
    cache = { at: Date.now(), times: highImpactTimes(await r.json()) };
    return cache.times;
  } catch {
    return cache?.times ?? [];
  }
}
