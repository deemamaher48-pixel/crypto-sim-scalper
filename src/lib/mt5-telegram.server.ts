// Telegram owner panel for the MT5 bridge: queues commands into mt5_commands (same path as the auto-bot).
import { turboBracket } from "@/lib/turbo-scalp";

type Kb = { text: string; callback_data: string }[][];
async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any };
}

const STATUS_AR: Record<string, string> = { pending: "⏳ بالانتظار", leased: "📡 عم يتنفذ", executed: "✅ تنفّذ", failed: "❌ فشل", unknown: "❔ غير معروف", cancelled: "🚫 ملغي" };

export async function mt5Panel(note?: string): Promise<{ text: string; kb: Kb }> {
  const d = await db();
  const [{ data: ctl }, { data: st }, { data: cmds }] = await Promise.all([
    d.from("mt5_control").select("emergency_stop,strategy").eq("id", 1).maybeSingle(),
    d.from("mt5_status").select("payload,updated_at").eq("id", 1).maybeSingle(),
    d.from("mt5_commands").select("action,status,sl,tp,ticket,result,created_at").order("created_at", { ascending: false }).limit(5),
  ]);
  const stop = !!ctl?.emergency_stop, strat = ctl?.strategy ?? "TURBO_SCALP_1M";
  const p = st?.payload ?? {};
  const lines = (cmds ?? []).map((c: any) => {
    const t = c.result?.ticket ?? c.ticket;
    return `• ${c.action} ${STATUS_AR[c.status] ?? c.status}${t ? ` #${t}` : ""}${c.result?.error ? ` (${c.result.error})` : ""} ${String(c.created_at).slice(11, 16)}`;
  }).join("\n") || "لا يوجد";
  const text = [
    "🥇 لوحة MT5 — الذهب XAUUSD (Inzo Demo)",
    `البوت: ${stop ? "🔴 متوقف (طوارئ)" : "🟢 شغّال"}`,
    `الاستراتيجية: ${strat === "TURBO_SCALP_1M" ? "⚡ تيربو سريع" : "🎯 قناص 1m + AI"}`,
    p.balance != null ? `الرصيد: ${p.balance}$ | الصافي: ${p.equity}$ (آخر تحديث ${String(st.updated_at).slice(0, 16).replace("T", " ")})` : "",
    "", "آخر الأوامر:", lines,
    note ? `\n📝 ${note}` : "",
  ].filter(Boolean).join("\n");
  const kb: Kb = [
    [{ text: "🟢 شراء فوري", callback_data: "mt5:buy" }, { text: "🔴 بيع فوري", callback_data: "mt5:sell" }],
    [{ text: "❌ إغلاق الكل", callback_data: "mt5:closeall" }, { text: "🔄 تبديل الاستراتيجية", callback_data: "mt5:strat" }],
    [{ text: stop ? "▶️ تشغيل البوت" : "🚨 قاطع الطوارئ", callback_data: "mt5:stop" }, { text: "🔃 تحديث", callback_data: "mt5" }],
    [{ text: "📄 لوحة المحاكاة", callback_data: "home" }],
  ];
  return { text, kb };
}

export async function mt5Action(a: string): Promise<string> {
  const d = await db();
  if (a === "stop") {
    const { data } = await d.from("mt5_control").select("emergency_stop").eq("id", 1).single();
    const next = !data.emergency_stop;
    await d.from("mt5_control").update({ emergency_stop: next, updated_at: new Date().toISOString() }).eq("id", 1);
    return next ? "🚨 تم إيقاف البوت (الإغلاق ما زال مسموح)" : "▶️ تم تشغيل البوت";
  }
  if (a === "strat") {
    const { data } = await d.from("mt5_control").select("strategy").eq("id", 1).single();
    const next = data.strategy === "TURBO_SCALP_1M" ? "SNIPER_1M" : "TURBO_SCALP_1M";
    await d.from("mt5_control").update({ strategy: next, updated_at: new Date().toISOString() }).eq("id", 1);
    return next === "TURBO_SCALP_1M" ? "⚡ صارت الاستراتيجية: تيربو سريع" : "🎯 صارت الاستراتيجية: قناص 1m + AI";
  }
  if (a === "buy" || a === "sell") {
    const { loadGoldKlines } = await import("@/functions/gold.functions");
    const k = await loadGoldKlines({ interval: "1m" });
    const price = k.rows[k.rows.length - 1]!.close;
    const b = turboBracket(a === "buy" ? "long" : "short", price);
    const { data, error } = await d.from("mt5_commands").insert({
      action: a === "buy" ? "BUY" : "SELL", symbol: "XAUUSD", lot: 0.01, sl: +b.stop.toFixed(2), tp: +b.target.toFixed(2),
      status: "pending", comment: "telegram manual", expires_at: new Date(Date.now() + 30_000).toISOString(),
    }).select("id").single();
    if (error) return `⚠️ ${error.message}`;
    return `${a === "buy" ? "🟢 شراء" : "🔴 بيع"} 0.01 قرب ${price.toFixed(2)} | SL ${b.stop.toFixed(2)} | TP ${b.target.toFixed(2)}\nرقم الأمر ${String(data.id).slice(0, 8)} — اضغطي تحديث بعد ثواني`;
  }
  if (a === "closeall") {
    const since = new Date(Date.now() - 3 * 864e5).toISOString();
    const { data } = await d.from("mt5_commands").select("result").in("action", ["BUY", "SELL"]).eq("status", "executed").gte("created_at", since);
    const tickets = [...new Set((data ?? []).map((r: any) => Number(r.result?.ticket)).filter((t: number) => t > 0))];
    if (!tickets.length) return "ما لقيت صفقات مفتوحة مسجّلة";
    const exp = new Date(Date.now() + 60_000).toISOString();
    for (const t of tickets) await d.from("mt5_commands").insert({ action: "CLOSE", symbol: "XAUUSD", ticket: t, status: "pending", comment: "telegram closeall", expires_at: exp });
    return `❌ أرسلت إغلاق لـ ${tickets.length} صفقة`;
  }
  return "";
}
