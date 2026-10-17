import { describe, expect, it } from "vitest";
import { breakerTripped, fastBreakeven, sniperBracket, sniperCooldown } from "@/lib/sniper-scalp";

describe("1m sniper", () => {
  it("gold SL is 1.5×ATR clamped to $0.8–$2.2, TP1 1.2×ATR, TP2 2.5×ATR", () => {
    expect(sniperBracket("long", 2000, 0.2).stop).toBeCloseTo(1999.2);
    expect(sniperBracket("long", 2000, 4).stop).toBeCloseTo(1997.8);
    const b = sniperBracket("short", 2000, 1);
    expect(b.stop).toBeCloseTo(2001.5);
    expect(b.tp1).toBeCloseTo(1998.8);
    expect(b.target).toBeCloseTo(1997.5);
  });
  it("fast breakeven only after 0.8×ATR in favour", () => {
    expect(fastBreakeven("long", 2000, 2000.7, 1)).toBeNull();
    expect(fastBreakeven("long", 2000, 2000.8, 1)!).toBeGreaterThan(2000);
  });
  it("cooldown lasts 5 minutes", () => {
    expect(sniperCooldown(0, 4 * 60_000)).toBe(true);
    expect(sniperCooldown(0, 5 * 60_000)).toBe(false);
  });
  it("circuit breaker trips on two consecutive losses", () => {
    expect(breakerTripped([-1, -2])).toBe(true);
    expect(breakerTripped([-1, 2, -3])).toBe(false);
  });
});
