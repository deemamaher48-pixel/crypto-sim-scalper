import { describe, expect, it } from "bun:test";
import { dailyReport } from "./daily-report";

describe("daily report", () => {
  it("counts bot wins and win rate, excluding manual trades", () => {
    const r = dailyReport([
      { side: "long", pnl: 5, swing: false, manual: false },
      { side: "short", pnl: -2, swing: false, manual: false },
      { side: "long", pnl: 9, swing: false, manual: true },
    ], 1000, 1012);
    expect(r).toContain("صفقات البوت: 2");
    expect(r).toContain("نسبة النجاح 50%");
    expect(r).toContain("+12.00$");
  });
});
