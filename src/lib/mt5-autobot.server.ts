import { inRolloverWindow } from "@/lib/smart-scalp";
import { sniperLiteBracket, sniperLiteSignal } from "@/lib/sniper-lite";
import { asianRange, dailyPivot, engineTurbo, pivotBias, scoreLot, sessionAt } from "@/lib/session-engine";
import { aiReviewTrade } from "@/lib/ai-analyst.server";
import { loadGoldKlines } from "@/functions/gold.functions";
import { ptsTag } from "@/lib/mt5-points";
import { circuitBreaker } from "@/lib/circuit-breaker";
import { adaptTurbo, outcomesFrom, type Adapt } from "@/lib/turbo-learn";
import { isSwingPos, swingSignal } from "@/lib/swing";
import { NEWS, newsPhase } from "@/lib/news-window";

const BLOCK_AR: Record<string, string> = {
  emergency_stop: "⛔ قاطع الطوارئ مفعّل — البوت ما رح يفتح صفقات لحتى تشغّليه",
  rollover: "🌙 وقت التسوية اليومية (2-4 فجراً بالشام) — سبريد عالي، البوت بيرجع لحاله بعدها",
  daily_limit: "📊 وصلنا الحد اليومي لعدد الصفقات",
  loss_streak_3: "🛡️ 3 خسائر حقيقية ورا بعض — صمام الأمان وقّف الدخول لحماية الحساب",
  daily_loss_limit: "🛡️ وصلت خسارة اليوم 20$ — توقف لحماية الحساب لبكرا",
};
/** Tell Telegram once whenever the bot's stop reason changes (and once when it resumes). */
async function reportState(db: any, reason: string | null) {
  try {
    const { data } = await db.from("mt5_status").select("payload").eq("id", 2).maybeSingle();
    const last = data?.payload?.block ?? null;
    if (last === reason) return;
    await db.from("mt5_status").upsert({ id: 2, payload: { block: reason }, updated_at: new Date().toISOString() });
    const { notifyOwners } = await import("@/lib/mt5-telegram.server");
    await notifyOwners(reason ? `⏸️ البوت وقّف الدخول التلقائي\n${BLOCK_AR[reason] ?? reason}` : "▶️ البوت رجع يدوّر على صفقات تلقائياً");
  } catch (e) { console.error("reportState", e); }
}

// Gold auto-bot for the MT5 bridge: strategy signal -> (AI veto for SNIPER) -> queue one BUY/SELL (0.01, SL+TP).
// MT5 holds SL/TP itself; the EA allows two positions (one swing + one turbo).
export const AUTO = { lot: 0.01, ttlSec: 30, minGapMin: 1, maxPerDay: 200, symbol: "XAUUSD", strategy: "TURBO_SCALP_1M" as "TURBO_SCALP_1M" | "SNIPER_1M" };

export async function mt5AutoTick() {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const r: any = await tick();
  if (r && (r.action === "idle" || r.action === "blocked")) await reportState(db, r.reason);
  else await reportState(db, null);
  return r;
}

async function tick() {
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
  const positions: any[] = fresh && Array.isArray(st.payload?.positions) ? st.payload.positions : [];
  let managed: unknown = undefined;
  if (positions.length > 0) {
    const { manageOpenPositions } = await import("@/lib/mt5-manager.server");
    managed = await manageOpenPositions(db, positions, typeof st.payload?.balance === "number" ? st.payload.balance : undefined);
  }
  // Two slots: one swing + one turbo. SNIPER keeps the old one-position rule.
  const swingOpen = positions.some((p) => isSwingPos(p));
  const turboOpen = positions.some((p) => !isSwingPos(p));
  if (positions.length >= 2 || (strategy !== "TURBO_SCALP_1M" && positions.length > 0)) return { action: "manage", results: managed };
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
  let side!: "long" | "short", b!: { stop: number; target: number }, ai!: { confidence: number | string }, smartWhy = "", lot = Number(ctl.lot ?? AUTO.lot);
  let swingTag = "";
  let swingWait = "";
  // Session + daily pivot compass (TURBO strategy only): buy only above P, sell only below, on the last closed 5m bar.
  const now = Date.now(), session = sessionAt(now);
  const ms = (rows: { time: number }[]) => rows.map((k: any) => ({ ...k, time: k.time * 1000 }));
  let h1: any[] = [], m15: any[] = [], m5rows: any[] = [], bias: "long" | "short" | null = null, pivot: ReturnType<typeof dailyPivot> = null;
  if (strategy === "TURBO_SCALP_1M") {
    const [k15, kh, k5] = await Promise.all([loadGoldKlines({ interval: "15m" }), loadGoldKlines({ interval: "1h" }), loadGoldKlines({ interval: "5m" })]);
    m15 = k15.rows.slice(0, -1); h1 = kh.rows.slice(0, -1);
    pivot = dailyPivot(ms(kh.rows), now);
    const m5 = k5.rows.slice(0, -1);
    m5rows = m5;
    if (pivot && m5.length) bias = pivotBias(m5[m5.length - 1]!.close, pivot);
  }
  if (strategy === "TURBO_SCALP_1M" && !swingOpen && (ctl.swing_enabled ?? true) && session !== "NY_LATE" && session !== "ROLLOVER") {
    const sw = swingSignal(m15, h1, price);
    swingWait = sw.reason;
    if (sw.side && bias && sw.side !== bias) swingWait = "سوينغ: البيفوت اليومي عكس الاتجاه";
    else if (sw.side) {
      const r = await aiReviewTrade({ symbol: "XAUUSD", side: sw.side, price, stop: sw.stop, target: sw.target, signalReason: `SWING 15m/1H: ${sw.reason}`, bars: m15, filter: h1, frame: "15m" });
      if (r.approve) {
        side = sw.side; b = sw; ai = r; swingTag = "SW "; lot = Number(ctl.lot ?? AUTO.lot);
        smartWhy = `🌊 سوينغ: ${sw.reason} | AI ${r.confidence}% — ${r.reason}`;
      } else swingWait = `سوينغ رُفض AI: ${r.reason}`;
    }
  }
  if (swingTag) { /* swing chosen */ }
  else if (turboOpen) return { action: "manage", results: managed, swing: swingWait };
  else if (strategy === "TURBO_SCALP_1M") {
    // News window: block before/at the release, then max 2 AI-reviewed turbo trades once direction settles.
    // News/spike protection disabled by user choice; keep code path for easy re-enable.
    const NEWS_GUARD = false;
    const news = NEWS_GUARD ? newsPhase(Date.now(), c1) : null;
    if (news && news.phase !== "post") return { action: "wait", reason: `📰 ${news.phase === "pre" ? "قبل الخبر" : "صدمة الخبر"} — ${news.why}` };
    if (news) {
      const { count: nw } = await db.from("mt5_commands").select("id", { count: "exact", head: true }).in("action", ["BUY", "SELL"]).like("comment", "auto%NW%").neq("status", "cancelled").gte("created_at", new Date(news.start).toISOString());
      if ((nw ?? 0) >= NEWS.maxTrades) return { action: "wait", reason: "📰 خلصت صفقتين الخبر" };
    }
    // Turbo direction follows the 1m trend (EMA21 vs EMA50), not the daily pivot — user choice.
    const { ema } = await import("@/lib/trading");
    const cls = c1.map((k) => k.close);
    const t21 = ema(cls, 21).at(-1)!, t50 = ema(cls, 50).at(-1)!;
    const turboBias: "long" | "short" = t21 > t50 ? "long" : "short";
    // Session engine: Asia bounce / London Asia-range breakout / flexible trend pullback or micro-breakout.
    const swingPos = positions.find((p) => isSwingPos(p));
    let sig: any = engineTurbo(c1, session, turboBias, asianRange(ms(m15), now), null);
    const { m5Gate } = await import("@/lib/m5-structure");
    const { htfGate } = await import("@/lib/htf-gate");
    let blocked = sig.side ? (m5Gate(m5rows, sig.side) ?? htfGate(h1, sig.side)) : sig.reason;
    // Reversal engine (user rule): firm 5m + 1H = quick scalp; firm 15m body + 4H = strong. Lets the bot flip after a stop.
    if (blocked) {
      const { reversalSignal } = await import("@/lib/reversal");
      const rv = reversalSignal(m5rows, m15, h1);
      if (!rv) return { action: "wait", reason: blocked };
      sig = { side: rv.side, slPts: rv.slPts, tpPts: rv.tpPts, score: rv.score, reason: rv.reason, tag: rv.strong ? "REV+" : "REV" };
    }
    side = sig.side;
    if (adapt.blockSide === side && sig.score < 3) return { action: "wait", reason: `learn: ${adapt.note}` };
    // User SL/TP points stay maximums.
    const slPts = Math.min(sig.slPts, Number(ctl.sl_points ?? sig.slPts)), tpPts = Math.min(sig.tpPts, Number(ctl.tp_points ?? sig.tpPts));
    const d = side === "long" ? 1 : -1;
    b = { stop: price - d * slPts, target: price + d * tpPts };
    smartWhy = `${sig.reason} | ستوب ${slPts} هدف ${tpPts}`; ai = { confidence: sig.tag };
    const unsecured = positions.some((p) => !(p.sl > 0 && (p.type === "BUY" ? p.sl >= p.price_open : p.sl <= p.price_open)));
    lot = scoreLot(lot, sig.score, unsecured); if (sig.score >= 2) smartWhy += ` | 💪 قوة ${sig.score}/3`;
    if (adapt.note) smartWhy += ` | 🧠 ${adapt.note}`;
    if (news) {
      const k5 = await loadGoldKlines({ interval: "5m" });
      const r = await aiReviewTrade({ symbol: "XAUUSD", side, price, stop: b.stop, target: b.target, signalReason: `NEWS TURBO after ${news.why}: ${sig.reason}. Confirm the post-news direction is real, not a fakeout.`, bars: c1, filter: k5.rows.slice(0, -1), frame: "1m" });
      if (!r.approve) return { action: "vetoed", reason: `📰 AI رفض صفقة الخبر: ${r.reason}` };
      ai = r; swingTag = "NW "; lot = Number(ctl.lot ?? AUTO.lot);
      smartWhy = `📰 تيربو خبر (${news.why}) | AI ${r.confidence}% — ${r.reason}`;
    }
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
    comment: `auto ${swingTag}ai${ai.confidence} ${ptsTag(price, b)}${bal !== undefined ? ` bal:${bal}` : ""}`, expires_at: new Date(Date.now() + AUTO.ttlSec * 1000).toISOString(),
  }).select("id").single();
  if (error) throw error;
  try { const { notifyOwners } = await import("@/lib/mt5-telegram.server"); await notifyOwners(`🤖 البوت فتح صفقة تلقائية\n${side === "long" ? "🟢 شراء" : "🔴 بيع"} ذهب ${lot}\n💵 السعر ≈ ${price.toFixed(2)}\n🎯 الهدف ${b.target.toFixed(2)} | 🛑 الوقف ${b.stop.toFixed(2)}\n🧠 ${swingTag ? "سوينغ + AI" : strategy === "TURBO_SCALP_1M" ? "تيربو" : "قناص + AI"}${smartWhy ? `\n📐 ${smartWhy}` : ""}`); } catch (e) { console.error("notify", e); }
  return { action: "queued", id: data.id, side: sig.side, sl: b.stop, tp: b.target };
}

