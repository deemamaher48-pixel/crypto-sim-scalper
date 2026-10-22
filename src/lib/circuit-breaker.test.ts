import { expect, it } from "vitest";
import { circuitBreaker } from "./circuit-breaker";
it("stops after 3 real losses in a row", () => expect(circuitBreaker([1000, 998, 996, 994])).toBe("loss_streak_3"));
it("keeps trading after 2 losses", () => expect(circuitBreaker([1000, 1003, 1001, 999])).toBeNull());
it("stops at $20 daily loss", () => expect(circuitBreaker([1000, 1005, 980])).toBe("daily_loss_limit"));
it("ignores small smart-exit trims under $1.5", () => expect(circuitBreaker([1031.55, 1030.46, 1029.85, 1029.64])).toBeNull());
