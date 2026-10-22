import { expect, it } from "vitest";
import { adaptTurbo, outcomesFrom } from "./turbo-learn";

it("computes each trade P/L from the next entry balance", () => {
  expect(outcomesFrom([{ side: "short", bal: 1000 }, { side: "long", bal: 1003 }], 1001)).toEqual([{ side: "short", pnl: 3 }, { side: "long", pnl: -2 }]);
});
it("pauses a side after two losses in a row on that side", () => {
  expect(adaptTurbo([{ side: "long", pnl: -2 }, { side: "short", pnl: 2 }, { side: "long", pnl: -2 }]).blockSide).toBe("long");
});
it("keeps a side open if its last trade won", () => {
  expect(adaptTurbo([{ side: "long", pnl: -2 }, { side: "long", pnl: 2 }]).blockSide).toBeNull();
});
it("demands strength 3 when win rate is under 40%", () => {
  expect(adaptTurbo([{ side: "long", pnl: -2 }, { side: "short", pnl: -2 }, { side: "long", pnl: 1 }, { side: "short", pnl: -2 }]).minStrength).toBe(3);
});
it("normal rules when winning", () => {
  expect(adaptTurbo([{ side: "short", pnl: 1 }, { side: "short", pnl: 2 }, { side: "long", pnl: -2 }, { side: "short", pnl: 3 }]).minStrength).toBe(0);
});
it("ignores small exits under $1.5 when pausing a side", () => {
  expect(adaptTurbo([{ side: "short", pnl: 3 }, { side: "short", pnl: -0.61 }, { side: "short", pnl: -0.21 }]).blockSide).toBeNull();
});
