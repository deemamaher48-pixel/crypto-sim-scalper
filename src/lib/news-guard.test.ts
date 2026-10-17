import { describe, expect, it } from "vitest";
import { highImpactTimes, newsFreeze } from "./news-guard";

describe("news freeze", () => {
  const t = Date.parse("2026-10-16T12:30:00Z");
  it("freezes 10 minutes before and after", () => {
    expect(newsFreeze([t], t - 10 * 60_000)).toBe(t);
    expect(newsFreeze([t], t + 10 * 60_000)).toBe(t);
  });
  it("allows trading outside 10 minutes", () => {
    expect(newsFreeze([t], t - 11 * 60_000)).toBeNull();
    expect(newsFreeze([t], t + 11 * 60_000)).toBeNull();
  });
  it("only counts high-impact USD events", () => {
    expect(highImpactTimes([
      { country: "USD", impact: "High", date: "2026-10-16T08:30:00-04:00" },
      { country: "USD", impact: "Low", date: "2026-10-16T08:30:00-04:00" },
      { country: "EUR", impact: "High", date: "2026-10-16T08:30:00-04:00" },
    ])).toEqual([t]);
  });
});
