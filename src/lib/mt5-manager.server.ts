import { manageDecision, movePts, type MgrPos } from "@/lib/mt5-manager";
import { loadGoldKlines } from "@/functions/gold.functions";

const AR: Record<string, string> = { BREAKEVEN: "🔒 تأمين الصفقة بربح +0.5", CLOSE_PARTIAL: "✂️ جني نصف الربح", CLOSE: "❌ خروج ذكي" };
const WHY: Record<string, string> = { secure_entry: "السعر مشي 2.5 نقطة لصالحنا", take_half: "وصل ربح كافي", reversal_lock_profit: "شمعة انعكاس قوية — حماية الربح", trend_flipped_cut_loss: "الاتجاه انقلب — تقليل الخسارة", momentum_flip_cut: "الزخم انقلب فجأة — خروج بخسارة صغيرة بدل الستوب", stall_exit: "السوق ركد — خروج بدون خسارة", tp_weak_take: "قريب من الهدف والزخم ضعف — أخذ الربح قبل التراجع" };

// Bars cached briefly so the fast tracking loop stays within the price API rate limit.
let barCache: { at: number; rows: any[] } | null = null;
async function bars() {
  if (barCache && Date.now() - barCache.at < 20_000) return barCache.rows;
  const k1 = await loadGoldKlines({ interval: "1m" });
  barCache = { at: Date.now(), rows: k1.rows.slice(0, -1) };
  return barCache.rows;
}

// One managing command per ticket per 30 seconds.
export async function manageOpenPositions(db: any, positions: MgrPos[]) {
  const { data: ctl } = await db.from("mt5_control").select("auto_manage").eq("id", 1).maybeSingle();
  if (ctl && ctl.auto_manage === false) return [{ action: "hold", reason: "auto_manage_off" }];
  const rows = await bars();
  const out = [];
  for (const p of positions) {
    const tag = `mgr ${p.ticket}`;
    const since = new Date(Date.now() - 30_000).toISOString();
    const [{ data: recent }, { data: partial }] = await Promise.all([
      db.from("mt5_commands").select("id").like("comment", `${tag}%`).gte("created_at", since).limit(1),
      db.from("mt5_commands").select("id").like("comment", `${tag} CLOSE_PARTIAL%`).limit(1),
    ]);
    if (recent?.length) { out.push({ ticket: p.ticket, action: "wait" }); continue; }
    const { data: entry } = await db.from("mt5_commands").select("created_at").in("action", ["BUY", "SELL"]).contains("result", { ticket: p.ticket }).order("created_at", { ascending: false }).limit(1);
    const ageSec = entry?.[0]?.created_at ? (Date.now() - Date.parse(entry[0].created_at)) / 1000 : Infinity;
    const d = manageDecision(p, rows, !!partial?.length, ageSec);
    if (d.action === "hold") { out.push({ ticket: p.ticket, action: "hold" }); continue; }
    const { error } = await db.from("mt5_commands").insert({
      action: d.action, symbol: "XAUUSD", ticket: p.ticket, lot: d.lot ?? p.volume, status: "pending",
      comment: `${tag} ${d.action} ${d.reason}`, expires_at: new Date(Date.now() + 30_000).toISOString(),
    });
    if (error) { console.error("mgr insert", error); continue; }
    out.push({ ticket: p.ticket, ...d });
    try { const { notifyOwners } = await import("@/lib/mt5-telegram.server"); await notifyOwners(`🧠 إدارة ذكية\n${AR[d.action]}\n🎫 ${p.ticket} | ${p.type === "BUY" ? "شراء" : "بيع"} ${p.volume}\n📈 الحركة ${movePts(p).toFixed(2)} نقطة | ربح ${p.profit}$\n💡 ${WHY[d.reason] ?? d.reason}`); } catch (e) { console.error("notify", e); }
  }
  return out;
}

// Fast tracking: re-check open positions every ~10s for most of the minute between cron ticks.
export async function trackLoop(db: any, budgetMs = 45_000) {
  const end = Date.now() + budgetMs;
  while (Date.now() < end) {
    await new Promise(r => setTimeout(r, 10_000));
    const { data: st } = await db.from("mt5_status").select("payload,updated_at").eq("id", 1).maybeSingle();
    const fresh = st?.updated_at && Date.now() - Date.parse(st.updated_at) < 30_000;
    const pos = fresh && Array.isArray(st.payload?.positions) ? st.payload.positions : [];
    if (pos.length) { try { await manageOpenPositions(db, pos); } catch (e) { console.error("track", e); } }
  }
}
