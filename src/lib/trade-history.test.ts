import { describe, expect, it } from "vitest";
import { prependTrade } from "./trade-history";

describe("complete trade history", () => {
  it("retains every existing trade when adding beyond 500 trades", () => {
    const history = Array.from({ length: 500 }, (_, id) => ({ id }));
    const next = prependTrade(history, { id: 500 });
    expect(next).toHaveLength(501);
    expect(next[0]?.id).toBe(500);
    expect(next.at(-1)?.id).toBe(499);
    expect(next.slice(1)).toEqual(history);
  });
});