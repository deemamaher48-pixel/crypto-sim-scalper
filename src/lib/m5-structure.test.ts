import { describe, it, expect } from "vitest";
import { m5Gate } from "./m5-structure";

const down = Array.from({ length: 60 }, (_, i) => ({ high: 4100 - i + 0.5, low: 4100 - i - 0.5, close: 4100 - i }));

describe("m5Gate", () => {
  it("blocks buys when 5m is falling", () => {
    expect(m5Gate(down, "long")).not.toBeNull();
  });
  it("allows sells when 5m is falling", () => {
    expect(m5Gate(down, "short")).toBeNull();
  });
});
