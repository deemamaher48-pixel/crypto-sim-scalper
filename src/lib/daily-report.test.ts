import { describe, expect, it } from "vitest";
import { dailyReport } from "./daily-report";

describe("daily report", () => {
  it("counts bot wins and win rate, excluding manual trades", () => {
    const r = dailyReport([
      { side: "long", pnl: 5, swing: false, manual: false },
      { side: "short", pnl: -2, swing: false, manual: false },
      { side: "long", pnl: 9, swing: false, manual: true },
    ], 1000, 1012);
    expect(r).toContain("صفقات البوت: 2");
    expect(r).toContain("نسبة النجاح: 50%");
    expect(r).toContain("+12.00$");
  });
});

import { buildReportTrades } from "./daily-report";
describe("buildReportTrades", () => {
  it("uses real broker profit per ticket and links manager exits by ticket", () => {
    const { trades, exact } = buildReportTrades([
      { action: "SELL", comment: "auto aiTT pts:3/4.5 bal:1000", ticket: 11 },
      { action: "BUY", comment: "auto aiREV pts:2/3 bal:1010", ticket: 22 },
      { action: "CLOSE", comment: "mgr 11 CLOSE momentum_flip_cut", ticket: 11 },
    ], [{ ticket: 11, profit: 7.5 }, { ticket: 22, profit: -3 }, { ticket: 99, profit: 4 }], 1014.5);
    expect(exact).toBe(true);
    expect(trades[0]!.pnl).toBe(7.5);
    expect(trades[0]!.exits).toEqual(["momentum_flip_cut"]);
    expect(trades[1]!.pnl).toBe(-3);
    expect(trades[2]!.manual).toBe(true);
  });
  it("falls back to balance difference without broker deals", () => {
    const { trades, exact } = buildReportTrades([{ action: "BUY", comment: "auto aiTT bal:1000", ticket: 1 }], null, 1006);
    expect(exact).toBe(false);
    expect(trades[0]!.pnl).toBe(6);
  });
});
