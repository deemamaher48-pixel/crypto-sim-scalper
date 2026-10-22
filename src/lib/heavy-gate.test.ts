import { describe, expect, it } from "vitest";
import { needsHeavyGate } from "./heavy-gate";

const calm = [
  { open: 10, high: 11, low: 9, close: 10.2 },
  { open: 10.2, high: 10.8, low: 9.8, close: 10.1 },
];
const dump = [
  { open: 10, high: 11, low: 9, close: 10 },
  { open: 10, high: 10.1, low: 8, close: 8.1 },
];

describe("needsHeavyGate", () => {
  it("normal entry without stop or momentum skips heavy checks", () => {
    expect(needsHeavyGate(2, calm, "long")).toBe(false);
  });
  it("after a stop loss heavy checks apply", () => {
    expect(needsHeavyGate(-3, calm, "long")).toBe(true);
  });
  it("strong opposite 5m momentum applies heavy checks", () => {
    expect(needsHeavyGate(undefined, dump, "long")).toBe(true);
  });
});
