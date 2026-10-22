import { manageDecision, movePts, type MgrPos } from "@/lib/mt5-manager";
import { loadGoldKlines } from "@/functions/gold.functions";
import { isSwingPos, swingManage } from "@/lib/swing";

const AR: Record<string, string> = { BREAKEVEN: "🔒 تأمين الصفقة بربح +0.5", CLOSE_PARTIAL: "✂️ جني نصف الربح", CLOSE: "❌ خروج ذكي" };
const WHY: Record<string, string> = { secure_entry: "السعر مشي 2.5 نقطة لصالحنا", take_half: "وصل ربح كافي", reversal_lock_profit: "شمعة انعكاس قوية — حماية الربح", trend_flipped_cut_loss: "الاتجاه انقلب — تقليل الخسارة", momentum_flip_cut: "الزخم انقلب فجأة — خروج بخسارة صغيرة بدل الستوب", swing_secure: "صفقة السوينغ ربحت 4 نقاط — تأمين", stall_exit: "السوق ركد — خروج بدون خسارة", tp_weak_take: "قريب من الهدف والزخم ضعف — أخذ الربح قبل التراجع" };

// Bars cached briefly so the fast tracking loop stays within the price API rate limit.
let barCache: { at: number; rows: any[] } | null = null;
async function bars() {
  if (barCache && Date.now() - barCache.at < 20_000) return barCache.rows;
  const k1 = await loadGoldKlines({ interval: "1m" });
  barCache = { at: Date.now(), rows: k1.rows.slice(0, -1) };
  return barCache.rows;
}

// One managing command per ticket per 30 seconds.
export async function manageOpenPositions(db: any, positions: MgrPos[], balance?: number) {
  const { data: ctl } = await db.from("mt5_control").select("auto_manage").eq("id", 1).maybeSingle();
  if (ctl && ctl.auto_manage === false) return [{ action: "hold", reason: "auto_manage_off" }];
  const rows = await bars();
  const out = [];
  for (const p of positions) {
    const tag = `mgr ${p.ticket}`;
    const since = new Date(Date.now() - 60_000).toISOString();
    const [{ data: recent }, { data: partial }] = await Promise.all([
      db.from("mt5_commands").select("id").like("comment", `${tag}%`).gte("created_at", since).limit(1),
      db.from("mt5_commands").select("id").like("comment", `${tag} CLOSE_PARTIAL%`).limit(1),
    ]);
    if (recent?.length) { out.push({ ticket: p.ticket, action: "wait" }); continue; }
    const { data: entry } = await db.from("mt5_commands").select("created_at").in("action", ["BUY", "SELL"]).contains("result", { ticket: p.ticket }).order("created_at", { ascending: false }).limit(1);
    const ageSec = entry?.[0]?.created_at ? (Date.now() - Date.parse(entry[0].created_at)) / 1000 : Infinity;
    // Swing trades get their own slow management (break-even at +4); turbo rules would cut them early.
    const d = isSwingPos(p) ? { action: swingManage(p, rows[rows.length - 1]?.close ?? p.price_open), reason: "swing_secure" } as const : manageDecision(p, rows, !!partial?.length, ageSec);
    if (d.action === "hold") { out.push({ ticket: p.ticket, action: "hold" }); continue; }
    const { error } = await db.from("mt5_commands").insert({
      action: d.action, symbol: "XAUUSD", ticket: p.ticket, lot: d.lot ?? p.volume, status: "pending",
      comment: `${tag} ${d.action} ${d.reason}${typeof balance === "number" ? ` bal:${balance}` : ""}`, expires_at: new Date(Date.now() + 90_000).toISOString(),
    });
    if (error) { console.error("mgr insert", error); continue; }
    out.push({ ticket: p.ticket, ...d });
    try { const { notifyOwners } = await import("@/lib/mt5-telegram.server"); await notifyOwners(`🧠 إدارة ذكية — ⏳ أُرسل الأمر، بانتظار تأكيد MT5\n${AR[d.action]}\n🎫 ${p.ticket} | ${p.type === "BUY" ? "شراء" : "بيع"} ${p.volume}\n📈 الحركة ${movePts(p).toFixed(2)} نقطة | ربح تقريبي ${p.profit}$ (الرقم النهائي بعد التأكيد)\n💡 ${WHY[d.reason] ?? d.reason}`); } catch (e) { console.error("notify", e); }
  }
  return out;
}

// Verify executed protective commands against the broker snapshot (truth), then announce once.
export async function verifyProtective(db: any, positions: MgrPos[], snapAt?: string, balance?: number) {
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: cmds } = await db.from("mt5_commands").select("id,action,ticket,result,reported_at,comment")
    .in("action", ["CLOSE", "BREAKEVEN", "CLOSE_PARTIAL"]).eq("status", "executed").gte("reported_at", since).limit(20);
  for (const c of cmds ?? []) {
    if (c.result?.verified !== undefined) continue;
    const age = Date.now() - Date.parse(c.reported_at);
    if (age < 12_000) continue; // let the snapshot catch up
    if (snapAt && Date.parse(snapAt) < Date.parse(c.reported_at) + 5_000) continue; // need a snapshot taken after the command
    // Stale or "all positions" commands can't be tied to a ticket: close them silently, never spam.
    if (!c.ticket || age > 3 * 60_000) {
      await db.from("mt5_commands").update({ result: { ...c.result, verified: "silent" } }).eq("id", c.id).eq("status", "executed");
      continue;
    }
    const mine = positions.filter(p => p.ticket === c.ticket);
    let ok: boolean;
    if (c.action === "CLOSE") ok = mine.length === 0;
    else if (c.action === "BREAKEVEN") ok = mine.length === 0 || mine.every(p => p.type === "BUY" ? p.sl > p.price_open : p.sl > 0 && p.sl < p.price_open);
    else ok = true;
    // Claim the row first so a second loop can't announce it twice.
    const { data: claimed } = await db.from("mt5_commands").update({ result: { ...c.result, verified: ok }, ...(ok ? {} : { status: "failed" }) })
      .eq("id", c.id).eq("status", "executed").select("id");
    if (!claimed?.length) continue;
    const name = c.action === "CLOSE" ? "الإغلاق" : c.action === "BREAKEVEN" ? "التأمين" : "الإغلاق الجزئي";
    const t = c.ticket || "كل الصفقات";
    // Realized P/L = broker balance change (includes spread, commission, swap) — never our estimate.
    const pre = Number(/bal:(-?[\d.]+)/.exec(c.comment ?? "")?.[1]);
    const real = ok && c.action !== "BREAKEVEN" && Number.isFinite(pre) && typeof balance === "number" ? Math.round((balance - pre) * 100) / 100 : null;
    const pl = real === null ? "" : `\n💰 الربح الفعلي من MT5: ${real >= 0 ? "+" : ""}${real.toFixed(2)}$\n🏦 الرصيد: ${balance!.toFixed(2)}$`;
    const msg = ok ? `✅ تأكد ${name} فعليًا على MT5\n🎫 ${t}${pl}` : `⚠️ MT5 ردّ بالنجاح بس ${name} ما صار فعليًا\n🎫 ${t}\nرح يعيد النظام المحاولة تلقائيًا`;
    try { const { notifyOwners } = await import("@/lib/mt5-telegram.server"); await notifyOwners(msg); } catch (e) { console.error("notify", e); }
  }
}

// Fast tracking: re-check open positions every ~10s for most of the minute between cron ticks.
export async function trackLoop(db: any, budgetMs = 45_000) {
  const end = Date.now() + budgetMs;
  while (Date.now() < end) {
    await new Promise(r => setTimeout(r, 10_000));
    const { data: st } = await db.from("mt5_status").select("payload,updated_at").eq("id", 1).maybeSingle();
    const fresh = st?.updated_at && Date.now() - Date.parse(st.updated_at) < 30_000;
    if (!fresh) continue;
    const pos = Array.isArray(st.payload?.positions) ? st.payload.positions : [];
    try { await verifyProtective(db, pos, st.updated_at, typeof st.payload?.balance === "number" ? st.payload.balance : undefined); } catch (e) { console.error("verify", e); }
    if (pos.length) { try { await manageOpenPositions(db, pos, typeof st.payload?.balance === "number" ? st.payload.balance : undefined); } catch (e) { console.error("track", e); } }
  }
}
