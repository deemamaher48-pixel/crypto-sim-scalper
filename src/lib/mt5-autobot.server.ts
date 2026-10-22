import { inRolloverWindow } from "@/lib/smart-scalp";
import { sniperLiteBracket, sniperLiteSignal } from "@/lib/sniper-lite";
import { turboBracket, turboSignal, signalStrength, dynamicLot } from "@/lib/turbo-scalp";
import { smartBracket } from "@/lib/smart-bracket";
import { aiReviewTrade } from "@/lib/ai-analyst.server";
import { loadGoldKlines } from "@/functions/gold.functions";
import { ptsTag } from "@/lib/mt5-points";
import { circuitBreaker } from "@/lib/circuit-breaker";
import { adaptTurbo, outcomesFrom, type Adapt } from "@/lib/turbo-learn";

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
  // Never stack entries: wait while any entry (auto or manual) is still queued and unexpired.
  const { data: queued } = await db.from("mt5_commands").select("id").in("action", ["BUY", "SELL"]).in("status", ["pending", "leased"]).gt("expires_at", new Date().toISOString()).limit(1);
  if (queued?.length) return { action: "wait", reason: "entry_in_queue" };
  // Live MT5 snapshot (relay posts every ~20s): don't spam entries while a position is open.
  const { data: st } = await (db as any).from("mt5_status").select("payload,updated_at").eq("id", 1).maybeSingle();
  const fresh = st?.updated_at && Date.now() - Date.parse(st.updated_at) < 120_000;
  if (fresh && Array.isArray(st.payload?.positions) && st.payload.positions.length > 0) {
    const { manageOpenPositions } = await import("@/lib/mt5-manager.server");
    return { action: "manage", results: await manageOpenPositions(db, st.payload.positions, typeof st.payload?.balance === "number" ? st.payload.balance : undefined) };
  }
  if ((count ?? 0) >= (ctl.max_per_day ?? AUTO.maxPerDay)) return { action: "blocked", reason: "daily_limit" };
  const bal = typeof st?.payload?.balance === "number" ? st.payload.balance : undefined;
  // Daily circuit breaker: balance at each executed auto entry (bal: tag) gives each trade's real P/L.
  let adapt: Adapt = { blockSide: null, minStrength: 0, note: "" };
  if (bal !== undefined) {
    const { data: done } = await db.from("mt5_commands").select("action,comment").in("action", ["BUY", "SELL"]).like("comment", "auto%").eq("status", "executed").gte("created_at", day.toISOString()).order("created_at", { ascending: true });
    const entries = (done ?? []).map((r: any) => ({ side: (r.action === "BUY" ? "long" : "short") as "long" | "short", bal: Number(/bal:(-?[\d.]+)/.exec(r.comment ?? "")?.[1]) })).filter((e: any) => Number.isFinite(e.bal));
    const cb = circuitBreaker([...entries.map((e: any) => e.bal), bal]);
    if (cb) return { action: "blocked", reason: cb };
    adapt = adaptTurbo(outcomesFrom(entries, bal));
  }

  const k1 = await loadGoldKlines({ interval: "1m" });
  const c1 = k1.rows.slice(0, -1);
  const price = k1.rows[k1.rows.length - 1]!.close;
  let side: "long" | "short", b: { stop: number; target: number }, ai: { confidence: number | string }, smartWhy = "", lot = Number(ctl.lot ?? AUTO.lot);
  if (strategy === "TURBO_SCALP_1M") {
    // Turbo: quick 2.5-point scalps in chop, no AI veto (user choice on demo account).
    const sig = turboSignal(c1);
    if (!sig?.side) return { action: "wait", reason: sig?.reason ?? "no_data" };
    side = sig.side;
    if (adapt.blockSide === side) return { action: "wait", reason: `learn: ${adapt.note}` };
    // Smart bracket: the user's SL/TP points are maximums; real distances come from swings and nearby levels.
    const fb = turboBracket(side, price);
    const sb = smartBracket(side, price, c1, Number(ctl.sl_points ?? Math.abs(price - fb.stop)), Number(ctl.tp_points ?? Math.abs(fb.target - price)));
    if (!sb.ok) return { action: "wait", reason: sb.why };
    b = sb; smartWhy = sb.why; ai = { confidence: "T" };
    const rr = Math.abs(sb.target - price) / Math.max(0.01, Math.abs(price - sb.stop));
    const strength = signalStrength(side, c1, rr);
    if (strength < adapt.minStrength) return { action: "wait", reason: `learn: ${adapt.note}` };
    lot = dynamicLot(lot, strength); if (strength >= 3) smartWhy += ` | 💪 قوة ${strength}/4`;
    if (adapt.note) smartWhy += ` | 🧠 ${adapt.note}`;
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
    action: sig.side === "long" ? "BUY" : "SELL", symbol: AUTO.symbol, lot,
    sl: +b.stop.toFixed(2), tp: +b.target.toFixed(2), status: "pending",
    comment: `auto ai${ai.confidence} ${ptsTag(price, b)}${bal !== undefined ? ` bal:${bal}` : ""}`, expires_at: new Date(Date.now() + AUTO.ttlSec * 1000).toISOString(),
  }).select("id").single();
  if (error) throw error;
  try { const { notifyOwners } = await import("@/lib/mt5-telegram.server"); await notifyOwners(`🤖 البوت فتح صفقة تلقائية\n${side === "long" ? "🟢 شراء" : "🔴 بيع"} ذهب ${lot}\n💵 السعر ≈ ${price.toFixed(2)}\n🎯 الهدف ${b.target.toFixed(2)} | 🛑 الوقف ${b.stop.toFixed(2)}\n🧠 ${strategy === "TURBO_SCALP_1M" ? "تيربو" : "قناص + AI"}${smartWhy ? `\n📐 ${smartWhy}` : ""}`); } catch (e) { console.error("notify", e); }
  return { action: "queued", id: data.id, side: sig.side, sl: b.stop, tp: b.target };
}

