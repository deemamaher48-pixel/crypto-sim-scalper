// Telegram owner panel for the MT5 bridge: queues commands into mt5_commands (same path as the auto-bot).
// Risk settings (lot, TP/SL points, daily cap) live in mt5_control and are shared with the auto-bot.

type Kb = { text: string; callback_data: string }[][];
async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any };
}

const STATUS_AR: Record<string, string> = { pending: "⏳ بالانتظار", leased: "📡 عم يتنفذ", executed: "✅ تنفّذ", failed: "❌ فشل", unknown: "❔ بدون رد", cancelled: "🚫 ملغي" };
const ACT_AR: Record<string, string> = { BUY: "🟢 شراء", SELL: "🔴 بيع", CLOSE: "❌ إغلاق", CLOSE_PARTIAL: "✂️ إغلاق جزئي", BREAKEVEN: "🔒 تأمين" };
export const LOTS = [0.01, 0.02, 0.05, 0.1];
export const TPS = [1.5, 2.5, 4, 6];
export const SLS = [2, 2.75, 4, 6];
const back = [{ text: "🔙 رجوع للوحة", callback_data: "mt5" }];
const mark = (on: boolean, t: string) => `${on ? "✅ " : ""}${t}`;

async function control() {
  const { data } = await (await db()).from("mt5_control").select("*").eq("id", 1).single();
  return data as { emergency_stop: boolean; strategy: string; lot: number; tp_points: number; sl_points: number; max_per_day: number; max_lot: number };
}

export async function mt5Panel(note?: string): Promise<{ text: string; kb: Kb }> {
  const d = await db();
  const day = new Date(); day.setUTCHours(0, 0, 0, 0);
  const [c, { data: st }, { data: cmds }, { count }] = await Promise.all([
    control(),
    d.from("mt5_status").select("payload,updated_at").eq("id", 1).maybeSingle(),
    d.from("mt5_commands").select("action,status,lot,sl,tp,ticket,result,created_at").order("created_at", { ascending: false }).limit(5),
    d.from("mt5_commands").select("id", { count: "exact", head: true }).in("action", ["BUY", "SELL"]).eq("status", "executed").gte("created_at", day.toISOString()),
  ]);
  const p = st?.payload ?? {};
  const pos: any[] = Array.isArray(p.positions) ? p.positions : [];
  const posLines = pos.map((x) => `• ${x.type === "BUY" ? "🟢 شراء" : "🔴 بيع"} ${x.volume} @ ${x.price_open} | #${x.ticket} | ${Number(x.profit) >= 0 ? "+" : ""}${x.profit}$`).join("\n") || "• لا يوجد";
  const lines = (cmds ?? []).map((x: any) => {
    const t = x.result?.ticket ?? x.ticket;
    return `• ${String(x.created_at).slice(11, 16)} ${ACT_AR[x.action] ?? x.action}${x.lot ? ` ${x.lot}` : ""} — ${STATUS_AR[x.status] ?? x.status}${t ? ` #${t}` : ""}${x.result?.error ? `\n   ↳ ${x.result.error}` : ""}`;
  }).join("\n") || "• لا يوجد";
  const age = st?.updated_at ? Math.round((Date.now() - Date.parse(st.updated_at)) / 1000) : null;
  const text = [
    "🥇 لوحة تداول الذهب — MT5 (Inzo)",
    "━━━━━━━━━━━━━━",
    `🤖 البوت: ${c.emergency_stop ? "🔴 متوقف" : "🟢 شغّال"}`,
    `🧠 الاستراتيجية: ${c.strategy === "TURBO_SCALP_1M" ? "⚡ تيربو سريع" : "🎯 قناص + ذكاء اصطناعي"}`,
    `📦 اللوت: ${c.lot} | 🎯 الهدف: ${c.tp_points} نقطة | 🛑 الوقف: ${c.sl_points} نقطة`,
    `📅 صفقات اليوم: ${count ?? 0} / ${c.max_per_day}`,
    "━━━━━━━━━━━━━━",
    p.balance != null ? `💰 الرصيد: ${p.balance}$ | الصافي: ${p.equity}$` : "💰 الرصيد: غير متوفر",
    age != null ? `📡 اتصال MT5: ${age < 120 ? "🟢 متصل" : `🟠 آخر تحديث قبل ${Math.round(age / 60)} دقيقة`}` : "📡 اتصال MT5: ⚪ غير معروف",
    "", "📊 الصفقات المفتوحة:", posLines,
    "", "🧾 آخر الأوامر:", lines,
    note ? `\n📝 ${note}` : "",
  ].join("\n");
  const kb: Kb = [
    [{ text: `🟢 شراء ${c.lot}`, callback_data: "mt5:buy" }, { text: `🔴 بيع ${c.lot}`, callback_data: "mt5:sell" }],
    [{ text: "❌ إغلاق الكل", callback_data: "mt5:closeall" }, { text: "🔒 تأمين على الدخول", callback_data: "mt5:be" }],
    [{ text: "🛡️ اللوت والمخاطر", callback_data: "mt5:risk" }, { text: "🔄 الاستراتيجية", callback_data: "mt5:strat" }],
    [{ text: c.emergency_stop ? "▶️ تشغيل البوت" : "⏸️ إيقاف البوت", callback_data: "mt5:stop" }, { text: "🔃 تحديث", callback_data: "mt5" }],
  ];
  return { text, kb };
}

export async function riskPanel(note?: string): Promise<{ text: string; kb: Kb }> {
  const c = await control();
  return {
    text: `🛡️ اللوت والمخاطر\n━━━━━━━━━━━━━━\n📦 اللوت الحالي: ${c.lot}\n🎯 الهدف: ${c.tp_points} نقطة (≈ ${(c.tp_points * c.lot * 100).toFixed(2)}$)\n🛑 الوقف: ${c.sl_points} نقطة (≈ ${(c.sl_points * c.lot * 100).toFixed(2)}$)\n📅 حد الصفقات اليومي: ${c.max_per_day}\n\nاختاري القيم من الأزرار 👇${note ? `\n\n📝 ${note}` : ""}`,
    kb: [
      LOTS.map((v) => ({ text: mark(+c.lot === v, `لوت ${v}`), callback_data: `mt5:lot:${v}` })),
      TPS.map((v) => ({ text: mark(+c.tp_points === v, `🎯 ${v}`), callback_data: `mt5:tp:${v}` })),
      SLS.map((v) => ({ text: mark(+c.sl_points === v, `🛑 ${v}`), callback_data: `mt5:sl:${v}` })),
      [10, 50, 200].map((v) => ({ text: mark(c.max_per_day === v, `📅 ${v}/يوم`), callback_data: `mt5:max:${v}` })),
      back,
    ],
  };
}

function openTickets(p: any): number[] {
  return (Array.isArray(p?.positions) ? p.positions : []).map((x: any) => Number(x.ticket)).filter((t: number) => t > 0);
}

/** Returns a note, or a full view for sub-panels. */
export async function mt5Action(a: string): Promise<{ text: string; kb: Kb }> {
  const d = await db();
  const now = new Date().toISOString();
  const [k, v] = a.split(":");
  if (k === "risk") return riskPanel();
  if (["lot", "tp", "sl", "max"].includes(k!) && v) {
    const n = Number(v);
    const ok = { lot: LOTS, tp: TPS, sl: SLS, max: [10, 50, 200] }[k as "lot"].includes(n);
    if (!ok) return riskPanel("⚠️ قيمة غير مسموحة");
    const col = { lot: "lot", tp: "tp_points", sl: "sl_points", max: "max_per_day" }[k as "lot"];
    await d.from("mt5_control").update({ [col]: n, updated_at: now }).eq("id", 1);
    return riskPanel("✅ تم الحفظ");
  }
  if (k === "stop") {
    const c = await control();
    await d.from("mt5_control").update({ emergency_stop: !c.emergency_stop, updated_at: now }).eq("id", 1);
    return mt5Panel(!c.emergency_stop ? "⏸️ تم إيقاف البوت التلقائي (الإغلاق ما زال متاح)" : "▶️ البوت رجع يشتغل ويفحص السوق كل دقيقة");
  }
  if (k === "strat") {
    const c = await control();
    const next = c.strategy === "TURBO_SCALP_1M" ? "SNIPER_1M" : "TURBO_SCALP_1M";
    await d.from("mt5_control").update({ strategy: next, updated_at: now }).eq("id", 1);
    return mt5Panel(next === "TURBO_SCALP_1M" ? "⚡ صارت الاستراتيجية: تيربو سريع" : "🎯 صارت الاستراتيجية: قناص + ذكاء اصطناعي");
  }
  if (k === "buy" || k === "sell") {
    const c = await control();
    const { loadGoldKlines } = await import("@/functions/gold.functions");
    const kl = await loadGoldKlines({ interval: "1m" });
    const price = kl.rows[kl.rows.length - 1]!.close;
    const dir = k === "buy" ? 1 : -1;
    const sl = +(price - dir * c.sl_points).toFixed(2), tp = +(price + dir * c.tp_points).toFixed(2);
    const { data, error } = await d.from("mt5_commands").insert({
      action: k === "buy" ? "BUY" : "SELL", symbol: "XAUUSD", lot: c.lot, sl, tp,
      status: "pending", comment: "telegram manual", expires_at: new Date(Date.now() + 30_000).toISOString(),
    }).select("id").single();
    if (error) return mt5Panel(`⚠️ ما انبعت الأمر: ${error.message}`);
    return mt5Panel(`${k === "buy" ? "🟢 أمر شراء" : "🔴 أمر بيع"} ${c.lot} انبعت لـ MT5\n💵 السعر ≈ ${price.toFixed(2)}\n🎯 الهدف ${tp} | 🛑 الوقف ${sl}\n🆔 ${String(data.id).slice(0, 8)} — اضغطي 🔃 تحديث بعد ثواني`);
  }
  if (k === "closeall" || k === "be") {
    const { data: st } = await d.from("mt5_status").select("payload").eq("id", 1).maybeSingle();
    const tickets = openTickets(st?.payload);
    if (!tickets.length) return mt5Panel("ما في صفقات مفتوحة حاليًا");
    const exp = new Date(Date.now() + 60_000).toISOString();
    for (const t of tickets) await d.from("mt5_commands").insert({ action: k === "be" ? "BREAKEVEN" : "CLOSE", symbol: "XAUUSD", ticket: t, status: "pending", comment: `telegram ${k}`, expires_at: exp });
    return mt5Panel(k === "be" ? `🔒 انبعت تأمين على الدخول لـ ${tickets.length} صفقة` : `❌ انبعت إغلاق لـ ${tickets.length} صفقة`);
  }
  return mt5Panel();
}

/** Owner push notification when the auto-bot queues an entry. */
export async function notifyOwners(text: string) {
  const { data } = await (await db()).from("telegram_admins").select("chat_id");
  const { tg } = await import("@/lib/telegram.server");
  for (const r of data ?? []) await tg("sendMessage", { chat_id: Number(r.chat_id), text, reply_markup: { inline_keyboard: [[{ text: "❌ إغلاق الكل", callback_data: "mt5:closeall" }, { text: "🥇 اللوحة", callback_data: "mt5" }]] } });
}
