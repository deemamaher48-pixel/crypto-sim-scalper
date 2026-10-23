import { describe, expect, it } from "vitest";
import { beTrigger, dailyPivot, pivotBias, scoreLot, sessionAt } from "./session-engine";

const at = (h: number) => Date.UTC(2026, 9, 22, h, 30);

describe("session engine", () => {
  it("maps UTC hours to sessions", () => {
    expect(sessionAt(at(3))).toBe("ASIA");
    expect(sessionAt(at(8))).toBe("LONDON_OPEN");
    expect(sessionAt(at(11))).toBe("LONDON_MID");
    expect(sessionAt(at(14))).toBe("NY_OVERLAP");
    expect(sessionAt(at(17))).toBe("NY_LATE");
    expect(sessionAt(at(21))).toBe("ROLLOVER");
  });
  it("computes the classic pivot from yesterday's bars", () => {
    const y = Date.UTC(2026, 9, 21);
    const h1 = Array.from({ length: 24 }, (_, i) => ({ time: y + i * 3_600_000, open: 100, high: i === 5 ? 110 : 102, low: i === 9 ? 90 : 98, close: 100, volume: 0 }));
    const p = dailyPivot(h1, at(10))!;
    expect(p.P).toBeCloseTo(100);
    expect(p.R1).toBeCloseTo(110);
    expect(p.S1).toBeCloseTo(90);
    expect(pivotBias(101, p)).toBe("long");
    expect(pivotBias(99, p)).toBe("short");
  });
  it("sizes lot by score and stays 0.01 while another trade is unsecured", () => {
    expect(scoreLot(0.01, 1, false)).toBe(0.01);
    expect(scoreLot(0.01, 2, false)).toBe(0.02);
    expect(scoreLot(0.01, 3, false)).toBe(0.03);
    expect(scoreLot(0.01, 3, true)).toBe(0.01);
  });
  it("secures turbo faster in the NY overlap", () => {
    expect(beTrigger("NY_OVERLAP")).toBe(2.5);
    expect(beTrigger("LONDON_MID")).toBe(2.5);
  });
});
