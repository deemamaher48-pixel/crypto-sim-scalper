import { expect, it } from "vitest";
import { circuitBreaker } from "./circuit-breaker";
it("stops after 3 losses in a row", () => expect(circuitBreaker([1000, 998, 997, 995])).toBe("loss_streak_3"));
it("keeps trading after 2 losses", () => expect(circuitBreaker([1000, 1003, 1001, 999])).toBeNull());
it("stops at $20 daily loss", () => expect(circuitBreaker([1000, 1005, 980])).toBe("daily_loss_limit"));
