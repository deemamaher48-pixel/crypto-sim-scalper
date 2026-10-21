import { inRolloverWindow } from "@/lib/smart-scalp";
import { sniperLiteBracket, sniperLiteSignal } from "@/lib/sniper-lite";
import { aiReviewTrade } from "@/lib/ai-analyst.server";
import { loadGoldKlines } from "@/functions/gold.functions";

// Gold auto-bot for the MT5 bridge: indicator signal -> AI veto -> queue one BUY/SELL (0.01, SL+TP).
// MT5 holds SL/TP itself and the EA allows one position, so the cloud only spaces entries out.
export const AUTO = { lot: 0.01, ttlSec: 30, minGapMin: 45, maxPerDay: 6, symbol: "XAUUSD" };

export async function mt5AutoTick() {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: ctl } = await db.from("mt5_control").select("emergency_stop").eq("id", 1).maybeSingle();
  if (!ctl || ctl.emergency_stop) return { action: "idle", reason: "emergency_stop" };
  if (inRolloverWindow(Date.now())) return { action: "idle", reason: "rollover" };

  const since = new Date(Date.now() - AUTO.minGapMin * 60_000).toISOString();
  const day = new Date(); day.setUTCHours(0, 0, 0, 0);
  const [{ data: recent }, { count }] = await Promise.all([
    db.from("mt5_commands").select("id").in("action", ["BUY", "SELL"]).neq("status", "cancelled").gte("created_at", since).limit(1),
    db.from("mt5_commands").select("id", { count: "exact", head: true }).in("action", ["BUY", "SELL"]).like("comment", "auto%").gte("created_at", day.toISOString()),
  ]);
  if (recent?.length) return { action: "wait", reason: "recent_entry" };
  if ((count ?? 0) >= AUTO.maxPerDay) return { action: "blocked", reason: "daily_limit" };

  // Active strategy: SNIPER_1M lite (EMA 9/21 + RSI 9 + clean body) on closed 1m bars, 5m only as AI context.
  const [k1, k5] = await Promise.all([loadGoldKlines({ interval: "1m" }), loadGoldKlines({ interval: "5m" })]);
  const c1 = k1.rows.slice(0, -1), c5 = k5.rows.slice(0, -1);
  const sig = sniperLiteSignal(c1);
  if (!sig?.side) return { action: "wait", reason: sig?.reason ?? "no_data" };
  const price = k1.rows[k1.rows.length - 1]!.close;
  const b = sniperLiteBracket(sig.side, price, sig.atr);
  const ai = await aiReviewTrade({ symbol: "XAUUSD", side: sig.side, price, stop: b.stop, target: b.target, signalReason: sig.reason, bars: c1, filter: c5, frame: "1m" });
  if (!ai.approve) return { action: "vetoed", reason: ai.reason };

  const { data, error } = await db.from("mt5_commands").insert({
    action: sig.side === "long" ? "BUY" : "SELL", symbol: AUTO.symbol, lot: AUTO.lot,
    sl: +b.stop.toFixed(2), tp: +b.target.toFixed(2), status: "pending",
    comment: `auto ai${ai.confidence}`, expires_at: new Date(Date.now() + AUTO.ttlSec * 1000).toISOString(),
  }).select("id").single();
  if (error) throw error;
  return { action: "queued", id: data.id, side: sig.side, sl: b.stop, tp: b.target };
}
