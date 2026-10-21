import { describe, expect, it } from "vitest";
import { turboBracket, turboSignal } from "./turbo-scalp";

const bar = (o: number, c: number, t: number) => ({ time: t, open: o, close: c, high: Math.max(o, c) + 0.1, low: Math.min(o, c) - 0.1, volume: 1 });

describe("turbo scalp", () => {
  it("bracket is TP 2.5 points and SL 2.75 points", () => {
    const b = turboBracket("long", 4125);
    expect(b.target).toBeCloseTo(4127.5);
    expect(b.stop).toBeCloseTo(4122.25);
  });
  it("does not buy in sideways chop", () => {
    const bars = Array.from({ length: 30 }, (_, i) => bar(4125 + (i % 2 ? 0.3 : 0), 4125 + (i % 2 ? 0 : 0.3), i));
    bars.push(bar(4125.2, 4126, 31));
    expect(turboSignal(bars)?.side ?? null).toBeNull();
  });
});

import { chaseBlock as _cb } from "./turbo-scalp";
import { it as _it, expect as _ex } from "vitest";
_it("blocks buying after 4 green candles in a row", () => {
  const bars = Array.from({ length: 20 }, (_, i) => ({ time: i, open: 100 + i, close: 100.5 + i, high: 101 + i, low: 99.8 + i }));
  _ex(_cb(bars as never, 119)).toBe("long");
});
_it("never buys against a falling trend", () => {
  const down = Array.from({ length: 60 }, (_, i) => bar(4200 - i * 0.5, 4199.6 - i * 0.5, i));
  down.push(bar(4170, 4170.6, 61));
  _ex(turboSignal(down)?.side).not.toBe("long");
});
_it("never sells against a rising trend", () => {
  const up = Array.from({ length: 60 }, (_, i) => bar(4100 + i * 0.5, 4100.4 + i * 0.5, i));
  up.push(bar(4130.4, 4129.8, 61));
  _ex(turboSignal(up)?.side).not.toBe("short");
});
