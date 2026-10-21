// Distances (in price points) travel with each entry so the EA re-anchors SL/TP on the broker's own fill price.
// Tag lives in the command comment ("pts:SL/TP") to avoid a schema change; /pending strips and parses it.

export function ptsTag(price: number, b: { stop: number; target: number }) {
  return `pts:${Math.abs(price - b.stop).toFixed(2)}/${Math.abs(b.target - price).toFixed(2)}`;
}

export function parsePts(comment: string | null | undefined): { comment: string; sl_pts: number; tp_pts: number } {
  const c = comment ?? "";
  const m = c.match(/pts:([\d.]+)\/([\d.]+)/);
  if (!m) return { comment: c, sl_pts: 0, tp_pts: 0 };
  return { comment: c.replace(m[0], "").trim(), sl_pts: Number(m[1]) || 0, tp_pts: Number(m[2]) || 0 };
}
