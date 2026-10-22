import { describe, expect, it } from "vitest";
import { channelPhase, goldBias } from "./channel-news";

const now = Date.UTC(2026, 9, 22, 12, 40);
describe("channel news", () => {
  it("reads gold direction", () => {
    expect(goldBias("🟡 الذهب: إيجابي")).toBe("BUY");
    expect(goldBias("🟡 الذهب: سلبي")).toBe("SELL");
  });
  it("blocks first 3 minutes of a CPI post", () => {
    expect(channelPhase([{ at: now - 2 * 60_000, text: "🇺🇸 | CPI أعلى من المتوقع\n🟡 الذهب: سلبي" }], now)?.phase).toBe("shock");
  });
  it("post phase carries bias, ignores minor and old news", () => {
    const r = channelPhase([{ at: now - 10 * 60_000, text: "CPI\n🟡 الذهب: سلبي" }], now);
    expect(r?.phase).toBe("post"); expect(r?.bias).toBe("SELL");
    expect(channelPhase([{ at: now - 5 * 60_000, text: "أسهم أبل ترتفع" }], now)).toBeNull();
    expect(channelPhase([{ at: now - 31 * 60_000, text: "CPI" }], now)).toBeNull();
  });
});
