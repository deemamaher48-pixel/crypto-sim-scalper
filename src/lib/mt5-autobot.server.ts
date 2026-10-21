import { inRolloverWindow } from "@/lib/smart-scalp";
import { sniperLiteBracket, sniperLiteSignal } from "@/lib/sniper-lite";
import { turboBracket, turboSignal } from "@/lib/turbo-scalp";
import { aiReviewTrade } from "@/lib/ai-analyst.server";
import { loadGoldKlines } from "@/functions/gold.functions";

// Gold auto-bot for the MT5 bridge: strategy signal -> (AI veto for SNIPER) -> queue one BUY/SELL (0.01, SL+TP).
// MT5 holds SL/TP itself and the EA allows one position, so the cloud only spaces entries out.
export const AUTO = { lot: 0.01, ttlSec: 30, minGapMin: 1, maxPerDay: 200, symbol: "XAUUSD", strategy: "TURBO_SCALP_1M" as "TURBO_SCALP_1M" | "SNIPER_1M" };

export async function mt5AutoTick() {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: ctl } = await (db as any).from("mt5_control").select("emergency_stop,strategy,lot,tp_points,sl_points,max_per_day").eq("id", 1).maybeSingle();
  if (!ctl || ctl.emergency_stop) return { action: "idle", reason: "emergency_stop" };
  const strategy = (ctl as { strategy?: string }).strategy ?? AUTO.strategy;
  if (inRolloverWindow(Date.now())) return { action: "idle", reason: "rollover" };

  const since = new Date(Date.now() - AUTO.minGapMin * 60_000).toISOString();
  const day = new Date(); day.setUTCHours(0, 0, 0, 0);
  const [{ data: recent }, { count }] = await Promise.all([
    db.from("mt5_commands").select("id").in("action", ["BUY", "SELL"]).like("comment", "auto%").neq("status", "cancelled").gte("created_at", since).limit(1),
    db.from("mt5_commands").select("id", { count: "exact", head: true }).in("action", ["BUY", "SELL"]).like("comment", "auto%").gte("created_at", day.toISOString()),
  ]);
  if (recent?.length) return { action: "wait", reason: "recent_entry" };
  if ((count ?? 0) >= (ctl.max_per_day ?? AUTO.maxPerDay)) return { action: "blocked", reason: "daily_limit" };

  const k1 = await loadGoldKlines({ interval: "1m" });
  const c1 = k1.rows.slice(0, -1);
  const price = k1.rows[k1.rows.length - 1]!.close;
  let side: "long" | "short", b: { stop: number; target: number }, ai: { confidence: number | string };
  if (strategy === "TURBO_SCALP_1M") {
    // Turbo: quick 2.5-point scalps in chop, no AI veto (user choice on demo account).
    const sig = turboSignal(c1);
    if (!sig?.side) return { action: "wait", reason: sig?.reason ?? "no_data" };
    side = sig.side; { const dd = side === "long" ? 1 : -1; b = ctl.tp_points ? { stop: price - dd * Number(ctl.sl_points), target: price + dd * Number(ctl.tp_points) } : turboBracket(side, price); } ai = { confidence: "T" };
  } else {
    const k5 = await loadGoldKlines({ interval: "5m" });
    const sig = sniperLiteSignal(c1);
    if (!sig?.side) return { action: "wait", reason: sig?.reason ?? "no_data" };
    side = sig.side; b = sniperLiteBracket(side, price, sig.atr);
    const r = await aiReviewTrade({ symbol: "XAUUSD", side, price, stop: b.stop, target: b.target, signalReason: sig.reason, bars: c1, filter: k5.rows.slice(0, -1), frame: "1m" });
    if (!r.approve) return { action: "vetoed", reason: r.reason };
    ai = r;
  }
  const sig = { side };

  const { data, error } = await db.from("mt5_commands").insert({
    action: sig.side === "long" ? "BUY" : "SELL", symbol: AUTO.symbol, lot: Number(ctl.lot ?? AUTO.lot),
    sl: +b.stop.toFixed(2), tp: +b.target.toFixed(2), status: "pending",
    comment: `auto ai${ai.confidence}`, expires_at: new Date(Date.now() + AUTO.ttlSec * 1000).toISOString(),
  }).select("id").single();
  if (error) throw error;
  try { const { notifyOwners } = await import("@/lib/mt5-telegram.server"); await notifyOwners(`🤖 البوت فتح صفقة تلقائية\n${side === "long" ? "🟢 شراء" : "🔴 بيع"} ذهب ${ctl.lot ?? AUTO.lot}\n💵 السعر ≈ ${price.toFixed(2)}\n🎯 الهدف ${b.target.toFixed(2)} | 🛑 الوقف ${b.stop.toFixed(2)}\n🧠 ${strategy === "TURBO_SCALP_1M" ? "تيربو" : "قناص + AI"}`); } catch (e) { console.error("notify", e); }
  return { action: "queued", id: data.id, side: sig.side, sl: b.stop, tp: b.target };
}
