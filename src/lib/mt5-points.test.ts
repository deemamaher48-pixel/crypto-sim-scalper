import { describe, expect, it } from "vitest";
import { parsePts, ptsTag } from "./mt5-points";

describe("mt5 points tag", () => {
  it("round-trips SL/TP distances for a buy", () => {
    const tag = ptsTag(4120, { stop: 4117.25, target: 4122.5 });
    expect(parsePts(`auto aiT ${tag}`)).toEqual({ comment: "auto aiT", sl_pts: 2.75, tp_pts: 2.5 });
  });
  it("no tag means no re-anchoring", () => {
    expect(parsePts("manual")).toEqual({ comment: "manual", sl_pts: 0, tp_pts: 0 });
  });
});
