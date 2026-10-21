import { manageDecision, movePts, type MgrPos } from "@/lib/mt5-manager";
import { loadGoldKlines } from "@/functions/gold.functions";

const AR: Record<string, string> = { BREAKEVEN: "🔒 تأمين الصفقة على الدخول", CLOSE_PARTIAL: "✂️ جني نصف الربح", CLOSE: "❌ خروج ذكي" };
const WHY: Record<string, string> = { secure_entry: "السعر مشي لصالحنا", take_half: "وصل ربح كافي", reversal_lock_profit: "شمعة انعكاس قوية — حماية الربح", trend_flipped_cut_loss: "الاتجاه انقلب — تقليل الخسارة", momentum_flip_cut: "الزخم انقلب فجأة — خروج بخسارة صغيرة بدل الستوب", stall_exit: "السوق ركد — خروج بدون خسارة" };

// Runs each tick while MT5 reports open positions; one managing command per ticket per 2 minutes.
export async function manageOpenPositions(db: any, positions: MgrPos[]) {
  const { data: ctl } = await db.from("mt5_control").select("auto_manage").eq("id", 1).maybeSingle();
  if (ctl && ctl.auto_manage === false) return [{ action: "hold", reason: "auto_manage_off" }];
  const k1 = await loadGoldKlines({ interval: "1m" });
  const bars = k1.rows.slice(0, -1);
  const out = [];
  for (const p of positions) {
    const tag = `mgr ${p.ticket}`;
    const since = new Date(Date.now() - 120_000).toISOString();
    const [{ data: recent }, { data: partial }] = await Promise.all([
      db.from("mt5_commands").select("id").like("comment", `${tag}%`).gte("created_at", since).limit(1),
      db.from("mt5_commands").select("id").like("comment", `${tag} CLOSE_PARTIAL%`).limit(1),
    ]);
    if (recent?.length) { out.push({ ticket: p.ticket, action: "wait" }); continue; }
    const d = manageDecision(p, bars, !!partial?.length);
    if (d.action === "hold") { out.push({ ticket: p.ticket, action: "hold" }); continue; }
    const { error } = await db.from("mt5_commands").insert({
      action: d.action, symbol: "XAUUSD", ticket: p.ticket, lot: d.lot ?? p.volume, status: "pending",
      comment: `${tag} ${d.action} ${d.reason}`, expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    if (error) { console.error("mgr insert", error); continue; }
    out.push({ ticket: p.ticket, ...d });
    try { const { notifyOwners } = await import("@/lib/mt5-telegram.server"); await notifyOwners(`🧠 إدارة ذكية\n${AR[d.action]}\n🎫 ${p.ticket} | ${p.type === "BUY" ? "شراء" : "بيع"} ${p.volume}\n📈 الحركة ${movePts(p).toFixed(2)} نقطة | ربح ${p.profit}$\n💡 ${WHY[d.reason] ?? d.reason}`); } catch (e) { console.error("notify", e); }
  }
  return out;
}
