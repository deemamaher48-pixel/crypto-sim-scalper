// Pure nightly Telegram summary of today's MT5 trades (bot vs manual, wins/losses, net, best/worst reasons).
export type ReportTrade = { side: "long" | "short"; pnl: number; swing: boolean; manual: boolean; entry?: string; exits?: string[] };

const ENTRY: Record<string, string> = {
  aiREV: "انعكاس زخم قوي", aiTT: "تيربو مع الترند", aiSW: "سوينغ مع ترند الساعة", SW: "سوينغ مع ترند الساعة",
};
const EXIT: Record<string, string> = {
  take_half: "جني نصف الربح", momentum_flip_cut: "انقلاب الزخم", ema21_break_grace: "كسر EMA21 ضدنا",
  reversal_lock_profit: "قفل الربح عند انعكاس", trend_flipped_cut_loss: "انقلاب الترند", tp_weak_take: "جني قبل الهدف لضعف الزخم",
  BREAKEVEN: "تأمين الدخول",
};

export function entryReason(comment: string): string {
  const tag = comment.split(" ")[1] ?? "";
  return ENTRY[tag] ?? (tag && !tag.startsWith("pts:") ? tag : "إشارة تيربو");
}

export function tradeReason(t: ReportTrade): string {
  const exits = (t.exits ?? []).map((e) => EXIT[e] ?? e);
  const end = exits.length ? exits.join(" + ") : t.pnl > 0 ? "جني أرباح" : "وقف خسارة";
  return `${t.side === "long" ? "شراء" : "بيع"} — ${t.entry ?? "إشارة تيربو"} ← ${end}`;
}

export function dailyReport(trades: ReportTrade[], startBal: number | null, endBal: number | null): string {
  const bot = trades.filter((t) => !t.manual);
  const wins = bot.filter((t) => t.pnl > 0), losses = bot.filter((t) => t.pnl < 0);
  const rate = bot.length ? Math.round((wins.length / bot.length) * 100) : 0;
  const sum = (a: ReportTrade[]) => +a.reduce((s, t) => s + t.pnl, 0).toFixed(2);
  const sign = (n: number) => `${n >= 0 ? "🟢 +" : "🔴 "}${n.toFixed(2)}$`;
  const net = startBal != null && endBal != null ? +(endBal - startBal).toFixed(2) : null;
  const pct = net != null && startBal ? ` (${((net / startBal) * 100).toFixed(2)}%)` : "";
  const turbo = bot.filter((t) => !t.swing), swing = bot.filter((t) => t.swing);
  const best = bot.length ? bot.reduce((a, b) => (b.pnl > a.pnl ? b : a)) : null;
  const worst = bot.length ? bot.reduce((a, b) => (b.pnl < a.pnl ? b : a)) : null;
  const manual = trades.length - bot.length;
  const lines = [
    "📊 تقرير اليوم — ذهب MT5",
    "━━━━━━━━━━━━━━",
    startBal != null ? `🏦 رصيد البداية: ${startBal.toFixed(2)}$` : "🏦 الرصيد غير متوفر",
    endBal != null ? `🏁 رصيد النهاية: ${endBal.toFixed(2)}$` : "",
    "━━━━━━━━━━━━━━",
    `🟢 إجمالي الربح: +${sum(wins).toFixed(2)}$`,
    `🔴 إجمالي الخسارة: ${sum(losses).toFixed(2)}$`,
    `💰 صافي البوت: ${sign(sum(bot))}`,
    net != null ? `💼 صافي الحساب: ${sign(net)}${pct}` : "",
    "━━━━━━━━━━━━━━",
    `🤖 صفقات البوت: ${bot.length}`,
    `✅ رابحة: ${wins.length}`,
    `❌ خاسرة: ${losses.length}`,
    `🎯 نسبة النجاح: ${rate}%`,
    "━━━━━━━━━━━━━━",
    `⚡ تيربو: ${turbo.length} صفقة ${sign(sum(turbo))}`,
    `🌊 سوينغ: ${swing.length} صفقة ${sign(sum(swing))}`,
    manual ? `✋ صفقات يدوية: ${manual} (خارج التقييم)` : "",
    best ? "━━━━━━━━━━━━━━" : "",
    best ? `🏆 أفضل صفقة: ${sign(best.pnl)}` : "",
    best ? `📝 السبب: ${tradeReason(best)}` : "",
    worst ? `⚠️ أسوأ صفقة: ${sign(worst.pnl)}` : "",
    worst ? `📝 السبب: ${tradeReason(worst)}` : "",
    "━━━━━━━━━━━━━━",
    !bot.length ? "😴 ما في صفقات تلقائية اليوم — السوق ما أعطى إشارة مكتملة." :
      rate >= 55 ? "💡 يوم جيد: البوت التزم بالاتجاه والإدارة حمت الأرباح." :
      losses.length >= 3 ? "💡 يوم متذبذب: خسائر متكررة — قاطع الخسائر والتعلّم الذاتي شدّدوا الشروط." :
      "💡 يوم متوسط: النتائج ضمن الطبيعي للسكالب، نكمل جمع الصفقات للتقييم.",
  ];
  return lines.filter(Boolean).join("\n");
}
