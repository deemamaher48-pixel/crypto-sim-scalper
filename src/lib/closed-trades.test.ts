import { describe, it, expect } from "vitest";
import { closedTrades } from "./closed-trades";

describe("closedTrades", () => {
  it("reports a closed winning trade with the balance gain", () => {
    const m = closedTrades({ balance: 1000, positions: [{ ticket: 5, type: "SELL", volume: 0.02, profit: 4 }] }, { balance: 1004.5, positions: [] });
    expect(m).toHaveLength(1);
    expect(m[0]).toContain("جني أرباح");
    expect(m[0]).toContain("+4.50$");
  });
  it("stays silent while the position is still open", () => {
    expect(closedTrades({ balance: 1000, positions: [{ ticket: 5 }] }, { balance: 1000, positions: [{ ticket: 5 }] })).toEqual([]);
  });
});
