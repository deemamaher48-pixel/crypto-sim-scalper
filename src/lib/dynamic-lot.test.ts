import { describe, it, expect } from "vitest";
import { dynamicLot } from "./turbo-scalp";
describe("dynamicLot", () => {
  it("base lot on weak signal", () => expect(dynamicLot(0.01, 2)).toBe(0.01));
  it("0.03 on strongest signal", () => expect(dynamicLot(0.01, 4)).toBe(0.03));
  it("0.02 on strong signal", () => expect(dynamicLot(0.01, 3)).toBe(0.02));
  it("capped at max", () => expect(dynamicLot(0.05, 4)).toBe(0.03));
});
