import { describe, expect, it } from "vitest";
import { scheduledPhase, spikePhase } from "./news-window";

const at = (h: number, m: number) => Date.UTC(2026, 9, 22, h, m); // Thursday

describe("news window", () => {
  it("blocks 5 min before the 12:30 release", () => {
    expect(scheduledPhase(at(12, 26))?.phase).toBe("pre");
  });
  it("first 3 minutes after release are shock", () => {
    expect(scheduledPhase(at(12, 31))?.phase).toBe("shock");
  });
  it("3 to 30 minutes after release is post (AI turbo window)", () => {
    expect(scheduledPhase(at(12, 40))?.phase).toBe("post");
    expect(scheduledPhase(at(13, 0))).toBeNull();
  });
  it("ignores weekends", () => {
    expect(scheduledPhase(Date.UTC(2026, 9, 24, 12, 40))).toBeNull();
  });
  it("detects a live spike candle", () => {
    const bars = Array.from({ length: 60 }, (_, i) => ({ time: i * 60, open: 100, high: 100.5, low: 99.5, close: 100, volume: 1 }));
    bars[55] = { ...bars[55]!, high: 106, low: 99 };
    expect(spikePhase(bars)?.phase).toBe("post");
    bars[58] = { ...bars[58]!, high: 107, low: 99 };
    expect(spikePhase(bars)?.phase).toBe("shock");
  });
});
